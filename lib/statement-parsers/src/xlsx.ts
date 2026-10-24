import { listZip, readZipEntry, type ZipEntry } from './zip';
import { LIMITS, StatementError } from './types';

/**
 * Чтение XLSX без сторонних библиотек: SheetJS из npm устарел и уязвим (CVE-2023-30533, CVE-2024-22363), а ставить его
 * из tarball нужно отдельно. Выписке нужны только значения ячеек первого непустого листа: общие строки, inline-строки,
 * числа и даты (по формату ячейки). Формулы не вычисляются — берётся сохранённое значение.
 */
export function readXlsx(bytes: Uint8Array, limits = { maxUncompressedBytes: LIMITS.maxUncompressedBytes, maxRows: LIMITS.maxRows }): string[][] {
  const entries = new Map(listZip(bytes).map((entry) => [entry.name.replace(/^\//, ''), entry]));
  const declared = [...entries.values()].reduce((sum, entry) => sum + entry.size, 0);
  if (declared > limits.maxUncompressedBytes * 4) {
    throw new StatementError('FILE_TOO_LARGE', 'Файл Excel слишком большой после распаковки. Скачайте выписку за меньший период.');
  }
  const budget = { left: limits.maxUncompressedBytes };
  const read = (entry: ZipEntry | undefined) => (entry ? new TextDecoder().decode(readZipEntry(bytes, entry, budget)) : null);

  const workbook = read(entries.get('xl/workbook.xml'));
  if (workbook === null) throw new StatementError('UNSUPPORTED_FILE', 'Это не таблица Excel. Загрузите выписку в CSV, XLSX или PDF.');
  const rels = read(entries.get('xl/_rels/workbook.xml.rels')) ?? '';
  const shared = parseSharedStrings(read(entries.get('xl/sharedStrings.xml')) ?? '');
  const dateStyles = parseDateStyles(read(entries.get('xl/styles.xml')) ?? '');

  const targets = new Map<string, string>();
  for (const [, attrs] of rels.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const id = attr(attrs, 'Id');
    const target = attr(attrs, 'Target');
    if (id && target) targets.set(id, target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`);
  }
  const sheets = [...workbook.matchAll(/<sheet\b([^>]*)\/?>/g)].map(([, attrs]) => targets.get(attr(attrs, 'r:id') ?? '') ?? '');
  if (!sheets.length) sheets.push('xl/worksheets/sheet1.xml');

  for (const path of sheets) {
    const xml = read(entries.get(path));
    if (!xml) continue;
    const rows = parseSheet(xml, shared, dateStyles, limits.maxRows);
    if (rows.filter((row) => row.some((cell) => cell.trim())).length >= 2) return rows;
  }
  return [];
}

function parseSharedStrings(xml: string): string[] {
  const strings: string[] = [];
  for (const [, inner] of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) strings.push(textOf(inner));
  return strings;
}

/** Текст из <t>, без фонетических подсказок <rPh>. */
function textOf(inner: string): string {
  let out = '';
  for (const [, text] of inner.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) out += unescapeXml(text);
  return out;
}

/** Какие стили ячеек (индекс в cellXfs) — даты: встроенные форматы 14–22, 45–47 и свои с d/m/y/h в коде. */
function parseDateStyles(xml: string): Set<number> {
  const custom = new Map<number, string>();
  for (const [, attrs] of xml.matchAll(/<numFmt\b([^>]*)\/?>/g)) custom.set(Number(attr(attrs, 'numFmtId')), unescapeXml(attr(attrs, 'formatCode') ?? ''));
  const isDate = (id: number) => {
    if ((id >= 14 && id <= 22) || (id >= 45 && id <= 47)) return true;
    const code = custom.get(id);
    if (!code) return false;
    const plain = code.replace(/"[^"]*"|\[[^\]]*\]|\\./g, '');
    return /[dmyhs]/i.test(plain) && !/[0#?]/.test(plain.replace(/[dmyhs]/gi, ''));
  };
  const result = new Set<number>();
  const cellXfs = xml.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/)?.[1] ?? '';
  let index = 0;
  for (const [, attrs] of cellXfs.matchAll(/<xf\b([^>]*?)(?:\/>|>)/g)) {
    if (isDate(Number(attr(attrs, 'numFmtId') ?? 0))) result.add(index);
    index++;
  }
  return result;
}

function parseSheet(xml: string, shared: string[], dateStyles: Set<number>, maxRows: number): string[][] {
  const rows: string[][] = [];
  const data = xml.match(/<sheetData\b[^>]*>([\s\S]*?)<\/sheetData>/)?.[1] ?? '';
  for (const [, rowAttrs, rowInner] of data.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const rowNumber = Number(attr(rowAttrs, 'r') ?? rows.length + 1) - 1;
    if (rowNumber >= maxRows + 1000) throw new StatementError('TOO_MANY_ROWS', `В выписке больше ${maxRows.toLocaleString('ru-RU')} строк. Скачайте её за меньший период.`);
    while (rows.length < rowNumber) rows.push([]);
    const row: string[] = [];
    let column = 0;
    for (const [, cellAttrs, cellInner = ''] of (rowInner ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = attr(cellAttrs, 'r');
      if (ref) column = columnIndex(ref);
      while (row.length < column) row.push('');
      row.push(cellValue(cellAttrs, cellInner, shared, dateStyles));
      column++;
    }
    rows[rowNumber] = row;
  }
  return rows;
}

function cellValue(attrs: string, inner: string, shared: string[], dateStyles: Set<number>): string {
  const type = attr(attrs, 't') ?? 'n';
  const raw = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1];
  switch (type) {
    case 's':
      return shared[Number(raw)] ?? '';
    case 'inlineStr':
      return textOf(inner.match(/<is>([\s\S]*?)<\/is>/)?.[1] ?? '');
    case 'str':
    case 'e':
      return raw === undefined ? '' : unescapeXml(raw);
    case 'b':
      return raw === '1' ? 'TRUE' : 'FALSE';
    case 'd':
      return raw ? unescapeXml(raw).replace('T', ' ').replace(/(\.\d+)?Z?$/, '') : '';
    default: {
      if (raw === undefined || raw === '') return '';
      const number = Number(raw);
      if (!Number.isFinite(number)) return raw;
      if (dateStyles.has(Number(attr(attrs, 's') ?? -1))) return excelDate(number);
      // числа с плавающей точкой: 1234.5000000001 → 1234.5; в выписках не больше двух знаков после запятой
      return Number.isInteger(number) ? raw : String(Math.round(number * 100) / 100);
    }
  }
}

function excelDate(serial: number): string {
  const days = Math.floor(serial);
  const seconds = Math.round((serial - days) * 86_400);
  const iso = new Date(Date.UTC(1899, 11, 30) + days * 86_400_000 + seconds * 1000).toISOString();
  return seconds ? `${iso.slice(0, 10)} ${iso.slice(11, 19)}` : iso.slice(0, 10);
}

function columnIndex(ref: string): number {
  let index = 0;
  for (const char of ref.replace(/\d+$/, '').toUpperCase()) index = index * 26 + (char.charCodeAt(0) - 64);
  return index - 1;
}

function attr(attrs: string, name: string): string | undefined {
  const match = attrs.match(new RegExp(`(?:^|\\s)${name.replace(':', '\\:')}="([^"]*)"`));
  return match?.[1];
}

function unescapeXml(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, entity: string) => {
    const lower = entity.toLowerCase();
    if (lower === 'amp') return '&';
    if (lower === 'lt') return '<';
    if (lower === 'gt') return '>';
    if (lower === 'quot') return '"';
    if (lower === 'apos') return "'";
    const code = lower.startsWith('#x') ? parseInt(lower.slice(2), 16) : parseInt(lower.slice(1), 10);
    return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : '';
  });
}
