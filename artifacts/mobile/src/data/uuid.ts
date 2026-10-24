/**
 * UUID v7 (RFC 9562): 48 бит времени в мс, затем случайные биты. Клиентский id новой записи —
 * повтор запроса с тем же id сервер узнаёт и не создаёт дубль; по времени id ещё и сортируются.
 */
export function uuidv7(randomBytes: (size: number) => Uint8Array, now = Date.now()): string {
  const bytes = randomBytes(16);
  let time = now;
  for (let i = 5; i >= 0; i--) {
    bytes[i] = time % 256;
    time = Math.floor(time / 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
