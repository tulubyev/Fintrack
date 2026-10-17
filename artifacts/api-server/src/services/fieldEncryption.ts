import crypto from "crypto";
import type { BankConnection, User } from "@shared/schema";
import { config } from "../../config/environment";

/**
 * Шифрование отдельных полей в БД (AES-256-GCM).
 *
 * Для каждого назначения свой ключ, выведенный из ENCRYPTION_KEY через HKDF: утечка
 * одного ключа не раскрывает остальные данные. Зашифрованное значение имеет вид
 * `enc:v1:<base64url(iv|tag|ciphertext)>`. Значения без префикса считаются старыми
 * открытыми данными и возвращаются как есть, пока миграция их не перешифрует.
 *
 * СНИЛС и ИНН шифруются детерминированно (IV = HMAC от значения): одинаковые значения
 * дают одинаковый шифртекст, поэтому работают уникальность и поиск по равенству.
 */

type Purpose = "bank-token" | "user-pii" | "2fa-secret" | "2fa-backup";

const PREFIX = "enc:v1:";
const BACKUP_PREFIX = "h:v1:";

const masterKey = (() => {
  const raw = config.crypto.encryptionKey;
  return /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "utf8");
})();

const keys = new Map<string, Buffer>();
function key(purpose: Purpose, kind: "enc" | "iv" | "mac"): Buffer {
  const name = `${purpose}:${kind}`;
  let k = keys.get(name);
  if (!k) {
    k = Buffer.from(crypto.hkdfSync("sha256", masterKey, Buffer.alloc(0), `fintrack:field:${name}`, 32));
    keys.set(name, k);
  }
  return k;
}

export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(PREFIX);
}

export function encryptField(value: string, purpose: Purpose, deterministic = false): string {
  if (isEncrypted(value)) return value;
  const iv = deterministic
    ? crypto.createHmac("sha256", key(purpose, "iv")).update(value).digest().subarray(0, 12)
    : crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(purpose, "enc"), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64url");
}

export function decryptField(value: string, purpose: Purpose): string {
  if (!isEncrypted(value)) return value;
  const data = Buffer.from(value.slice(PREFIX.length), "base64url");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(purpose, "enc"), data.subarray(0, 12));
  decipher.setAuthTag(data.subarray(12, 28));
  return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString("utf8");
}

const enc = (v: string | null | undefined, purpose: Purpose, deterministic = false) =>
  v == null ? v : encryptField(v, purpose, deterministic);
const dec = (v: string | null | undefined, purpose: Purpose) => (v == null ? v : decryptField(v, purpose));

/** Детерминированный шифртекст СНИЛС для поиска по равенству. */
export function snilsLookupValue(snils: string): string {
  return encryptField(snils, "user-pii", true);
}

const backupCodeMac = (code: string) =>
  BACKUP_PREFIX + crypto.createHmac("sha256", key("2fa-backup", "mac")).update(code.trim()).digest("hex");

/** Резервные коды 2FA хранятся как HMAC: показываются пользователю один раз, читать их не нужно. */
export function hashBackupCode(code: string): string {
  // Уже хешированное значение при записи не хешируется повторно
  if (code.startsWith(BACKUP_PREFIX)) return code;
  return backupCodeMac(code);
}

/** Индекс совпавшего резервного кода (хешированного или старого открытого) или -1. */
export function findBackupCode(stored: string[] | null | undefined, code: string): number {
  const input = code?.trim();
  // Сам хеш из БД (например, из утёкшего дампа) кодом не является
  if (!stored?.length || !input || input.startsWith(BACKUP_PREFIX)) return -1;
  const hashed = backupCodeMac(input);
  return stored.findIndex((entry) => entry === hashed || (!entry.startsWith(BACKUP_PREFIX) && entry === input));
}

type UserSecrets = Pick<User, "snils" | "inn" | "twoFactorSecret" | "twoFactorBackupCodes">;

/** Шифрует чувствительные поля перед записью пользователя в БД. */
export function protectUserFields<T extends Partial<UserSecrets>>(data: T): T {
  const out = { ...data };
  if ("snils" in out) out.snils = enc(out.snils, "user-pii", true);
  if ("inn" in out) out.inn = enc(out.inn, "user-pii", true);
  if ("twoFactorSecret" in out) out.twoFactorSecret = enc(out.twoFactorSecret, "2fa-secret");
  if ("twoFactorBackupCodes" in out && out.twoFactorBackupCodes) {
    out.twoFactorBackupCodes = out.twoFactorBackupCodes.map(hashBackupCode);
  }
  return out;
}

/** Расшифровывает поля пользователя, прочитанного из БД. Резервные коды остаются хешами. */
export function revealUserFields<T extends Partial<UserSecrets> | undefined>(user: T): T {
  if (!user) return user;
  const out = { ...user };
  if ("snils" in out) out.snils = dec(out.snils, "user-pii");
  if ("inn" in out) out.inn = dec(out.inn, "user-pii");
  if ("twoFactorSecret" in out) out.twoFactorSecret = dec(out.twoFactorSecret, "2fa-secret");
  return out;
}

type BankSecrets = Pick<BankConnection, "accessToken" | "refreshToken">;

export function protectBankTokens<T extends Partial<BankSecrets>>(data: T): T {
  const out = { ...data };
  if ("accessToken" in out) out.accessToken = enc(out.accessToken, "bank-token");
  if ("refreshToken" in out) out.refreshToken = enc(out.refreshToken, "bank-token");
  return out;
}

export function revealBankTokens<T extends Partial<BankSecrets> | undefined>(connection: T): T {
  if (!connection) return connection;
  const out = { ...connection };
  if ("accessToken" in out) out.accessToken = dec(out.accessToken, "bank-token");
  if ("refreshToken" in out) out.refreshToken = dec(out.refreshToken, "bank-token");
  return out;
}
