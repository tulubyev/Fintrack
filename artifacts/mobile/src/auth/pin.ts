import { scryptAsync } from "@noble/hashes/scrypt.js";
import { bytesToHex, hexToBytes, randomBytes } from "@noble/hashes/utils.js";

/**
 * PIN хранится только хешем scrypt с солью (E2.1). Сам PIN нигде не сохраняется.
 * Перебор 10⁴–10⁶ вариантов офлайн всё равно быстрый — защищают хранилище устройства
 * (Keystore) и лимит в 5 попыток; параметры подобраны, чтобы проверка на Hermes шла доли секунды.
 */
const N = 2 ** 12;
const R = 8;
const P = 1;
const KEY_LENGTH = 32;

export const PIN_MIN_LENGTH = 4;
export const PIN_MAX_LENGTH = 6;

export function isValidPin(pin: string): boolean {
  return new RegExp(`^\\d{${PIN_MIN_LENGTH},${PIN_MAX_LENGTH}}$`).test(pin);
}

export async function hashPin(pin: string, salt: Uint8Array = randomBytes(16)): Promise<string> {
  const key = await scryptAsync(pin, salt, { N, r: R, p: P, dkLen: KEY_LENGTH });
  return `scrypt$${N}$${R}$${P}$${bytesToHex(salt)}$${bytesToHex(key)}`;
}

export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, saltHex, hashHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const key = await scryptAsync(pin, hexToBytes(saltHex), { N: Number(n), r: Number(r), p: Number(p), dkLen: hashHex.length / 2 });
  const expected = hexToBytes(hashHex);
  // Сравнение за постоянное время
  let diff = key.length ^ expected.length;
  for (let i = 0; i < Math.min(key.length, expected.length); i++) diff |= key[i] ^ expected[i];
  return diff === 0;
}
