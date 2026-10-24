/**
 * Кодировка текстовых выписок: BOM, затем строгая проверка UTF-8, при ошибке — windows-1251
 * (старые выгрузки Т-Банка и Альфы). Node собран с full-icu, отдельная библиотека не нужна.
 */
export function decodeText(bytes: Uint8Array): { text: string; encoding: 'utf-8' | 'utf-16le' | 'utf-16be' | 'windows-1251' } {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return { text: new TextDecoder('utf-8').decode(bytes.subarray(3)), encoding: 'utf-8' };
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return { text: new TextDecoder('utf-16le').decode(bytes.subarray(2)), encoding: 'utf-16le' };
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return { text: new TextDecoder('utf-16be').decode(bytes.subarray(2)), encoding: 'utf-16be' };
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), encoding: 'utf-8' };
  } catch {
    return { text: new TextDecoder('windows-1251').decode(bytes), encoding: 'windows-1251' };
  }
}

/** Нормализация для сравнения названий колонок и описаний: нижний регистр, ё → е, неразрывные пробелы, схлопнутые пробелы. */
export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[   \t\r\n]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
