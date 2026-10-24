/**
 * Хранение исходных файлов выписок (E1.2, решение D8): 30 дней в IMPORTS_DIR, зашифрованными AES-256-GCM.
 * Ключ выводится из ENCRYPTION_KEY через HKDF с меткой `imports` — отдельный от ключей полей и документов.
 * Файл: «FTI1» | iv (12) | tag (16) | шифртекст. Путь — <userId>/<batchId>.enc, оба uuid: имя файла пользователя
 * в путь не попадает. Каталог создаётся при первой записи (том на проде уже существует и не берёт папки из образа).
 */
import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { config } from "../../../config/environment";

const MAGIC = Buffer.from("FTI1");

let cachedKey: Buffer | null = null;
function key(): Buffer {
  if (!cachedKey) {
    const raw = config.crypto.encryptionKey;
    const master = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "utf8");
    cachedKey = Buffer.from(crypto.hkdfSync("sha256", master, Buffer.alloc(0), "fintrack:imports", 32));
  }
  return cachedKey;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function storedPathFor(userId: string, batchId: string): string {
  if (!UUID.test(userId) || !UUID.test(batchId)) throw new Error("Некорректный id для пути файла импорта");
  return `${userId}/${batchId}.enc`;
}

function absolute(storedPath: string): string {
  const root = path.resolve(config.storage.importsDir);
  const full = path.resolve(root, storedPath);
  if (!full.startsWith(root + path.sep)) throw new Error("Путь файла импорта вне каталога");
  return full;
}

export function encryptImportFile(bytes: Buffer): Buffer {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([cipher.update(bytes), cipher.final()]);
  return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), ciphertext]);
}

export function decryptImportFile(data: Buffer): Buffer {
  if (data.length < 32 || !data.subarray(0, 4).equals(MAGIC)) throw new Error("Файл импорта повреждён");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), data.subarray(4, 16));
  decipher.setAuthTag(data.subarray(16, 32));
  return Buffer.concat([decipher.update(data.subarray(32)), decipher.final()]);
}

export async function saveImportFile(storedPath: string, bytes: Buffer): Promise<void> {
  const full = absolute(storedPath);
  await fs.mkdir(path.dirname(full), { recursive: true, mode: 0o700 });
  await fs.writeFile(full, encryptImportFile(bytes), { mode: 0o600 });
}

export async function readImportFile(storedPath: string): Promise<Buffer> {
  return decryptImportFile(await fs.readFile(absolute(storedPath)));
}

/** Удаление файла; отсутствующий файл — не ошибка (повтор задачи очистки). */
export async function removeImportFile(storedPath: string): Promise<void> {
  await fs.rm(absolute(storedPath), { force: true });
}
