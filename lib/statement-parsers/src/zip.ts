import { inflateRawSync } from 'node:zlib';
import { StatementError } from './types';

/**
 * Минимальный читатель ZIP — только для XLSX (zip с XML внутри). Без ZIP64 и шифрования: выписки весят до 15 МБ.
 * Защита от zip-бомб: суммарный несжатый размер ограничен и по заголовкам, и по факту распаковки (maxOutputLength).
 */
export type ZipEntry = { name: string; method: number; compressedSize: number; size: number; offset: number };

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

export function listZip(bytes: Uint8Array): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i--) {
    if (view.getUint32(i, true) === EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw broken();
  const count = view.getUint16(eocd + 10, true);
  let pos = view.getUint32(eocd + 16, true);
  const entries: ZipEntry[] = [];
  const decoder = new TextDecoder();
  for (let i = 0; i < count; i++) {
    if (pos + 46 > bytes.length || view.getUint32(pos, true) !== CENTRAL) throw broken();
    const nameLength = view.getUint16(pos + 28, true);
    const extraLength = view.getUint16(pos + 30, true);
    const commentLength = view.getUint16(pos + 32, true);
    entries.push({
      method: view.getUint16(pos + 10, true),
      compressedSize: view.getUint32(pos + 20, true),
      size: view.getUint32(pos + 24, true),
      offset: view.getUint32(pos + 42, true),
      name: decoder.decode(bytes.subarray(pos + 46, pos + 46 + nameLength)),
    });
    pos += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

/** Распаковывает нужные файлы архива; budget — сколько байт ещё можно распаковать (общий на весь архив). */
export function readZipEntry(bytes: Uint8Array, entry: ZipEntry, budget: { left: number }): Uint8Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (entry.offset + 30 > bytes.length || view.getUint32(entry.offset, true) !== LOCAL) throw broken();
  const start = entry.offset + 30 + view.getUint16(entry.offset + 26, true) + view.getUint16(entry.offset + 28, true);
  const data = bytes.subarray(start, start + entry.compressedSize);
  if (entry.size > budget.left) throw tooLarge();
  let out: Uint8Array;
  if (entry.method === 0) out = data;
  else if (entry.method === 8) {
    try {
      out = inflateRawSync(data, { maxOutputLength: Math.max(1, budget.left) });
    } catch (error) {
      if ((error as { code?: string }).code === 'ERR_BUFFER_TOO_LARGE') throw tooLarge();
      throw broken();
    }
  } else throw broken();
  budget.left -= out.length;
  return out;
}

const broken = () => new StatementError('UNSUPPORTED_FILE', 'Файл Excel повреждён или зашифрован. Скачайте выписку заново или сохраните её как CSV.');
const tooLarge = () => new StatementError('FILE_TOO_LARGE', 'Файл Excel слишком большой после распаковки. Скачайте выписку за меньший период.');
