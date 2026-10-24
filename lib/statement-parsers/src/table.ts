import { createHash } from 'node:crypto';
import { readCsv } from './csv';
import { parseAmount } from './numbers';
import { parseDateTime } from './dates';
import { decodeText, normalizeText } from './text';
import { readXlsx } from './xlsx';
import { LIMITS, StatementError, type FileType, type TablePreview } from './types';

/** Тип файла по первым байтам: %PDF, zip с xl/ внутри — XLSX, OLE2 — старый XLS, текст без нулевых байтов — CSV. */
export function sniffFileType(bytes: Uint8Array): FileType | null {
  const head = (n: number) => String.fromCharCode(...bytes.subarray(0, n));
  if (head(5) === '%PDF-') return 'pdf';
  if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
    // в XLSX среди первых файлов архива есть [Content_Types].xml или xl/…
    const probe = new TextDecoder('latin1').decode(bytes.subarray(0, Math.min(bytes.length, 64 * 1024)));
    return /\[Content_Types\]\.xml|xl\//.test(probe) ? 'xlsx' : null;
  }
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) return 'xls';
  const sample = bytes.subarray(0, Math.min(bytes.length, 8192));
  if (!sample.length) return null;
  const utf16 = (sample[0] === 0xff && sample[1] === 0xfe) || (sample[0] === 0xfe && sample[1] === 0xff);
  if (!utf16 && sample.includes(0)) return null;
  const text = decodeText(sample).text;
  // управляющие символы, кроме табуляции и переводов строк, в CSV не встречаются
  const control = [...text].filter((char) => char < ' ' && char !== '\t' && char !== '\n' && char !== '\r').length;
  return control <= text.length * 0.01 ? 'csv' : null;
}

export type Table = { fileType: 'csv' | 'xlsx'; rows: string[][]; encoding?: string; delimiter?: string };

export function readTable(bytes: Uint8Array, fileType: 'csv' | 'xlsx'): Table {
  if (fileType === 'xlsx') return { fileType, rows: trimRows(readXlsx(bytes)) };
  const { text, encoding } = decodeText(bytes);
  const { rows, delimiter } = readCsv(text);
  return { fileType, rows: trimRows(rows), encoding, delimiter };
}

function trimRows(rows: string[][]): string[][] {
  return rows.map((row) => (row ?? []).map((cell) => (cell ?? '').replace(/^﻿/, '').trim()));
}

const isEmptyRow = (row: string[]) => row.every((cell) => !cell);
const looksLikeValue = (cell: string) => parseAmount(cell) !== null || parseDateTime(cell) !== null;

/**
 * Строка заголовка: первая в первых 30 строках, где не меньше двух непустых текстовых ячеек, а в одной из следующих
 * пяти строк есть дата. Строки до неё — шапка выписки (банк, период, номер счёта).
 */
export function findHeader(rows: string[][]): number | null {
  const limit = Math.min(rows.length, 30);
  for (let i = 0; i < limit; i++) {
    const cells = rows[i].filter(Boolean);
    if (cells.length < 2 || cells.filter((cell) => !looksLikeValue(cell)).length < 2) continue;
    if (cells.some((cell) => looksLikeValue(cell)) && cells.length < 3) continue;
    const next = rows.slice(i + 1, i + 6);
    if (next.some((row) => row.some((cell) => parseDateTime(cell) !== null))) return i;
  }
  return null;
}

/** Отпечаток заголовка — по нему запоминается сопоставление колонок (import_mappings.header_fingerprint). */
export function headerFingerprint(header: string[]): string {
  return createHash('sha256').update(header.map(normalizeText).join('|')).digest('hex');
}

export type HeadedTable = { header: string[]; headerRowIndex: number; data: Array<{ rowIndex: number; cells: string[] }>; table: Table };

export function headTable(table: Table): HeadedTable {
  const nonEmpty = table.rows.filter((row) => !isEmptyRow(row));
  if (nonEmpty.length < 2) throw new StatementError('EMPTY_STATEMENT', 'В файле нет операций. Проверьте период выписки и скачайте её заново.');
  const headerRowIndex = findHeader(table.rows) ?? table.rows.findIndex((row) => !isEmptyRow(row));
  const header = table.rows[headerRowIndex];
  const data: HeadedTable['data'] = [];
  for (let i = headerRowIndex + 1; i < table.rows.length; i++) {
    if (!isEmptyRow(table.rows[i])) data.push({ rowIndex: data.length, cells: table.rows[i] });
  }
  if (data.length > LIMITS.maxRows) throw new StatementError('TOO_MANY_ROWS', `В выписке больше ${LIMITS.maxRows.toLocaleString('ru-RU')} строк. Скачайте её за меньший период.`);
  return { header, headerRowIndex, data, table };
}

export function preview(headed: HeadedTable): TablePreview {
  return {
    header: headed.header,
    headerRowIndex: headed.headerRowIndex,
    rows: headed.data.slice(0, LIMITS.previewRows).map((row) => row.cells),
    fingerprint: headerFingerprint(headed.header),
    fileType: headed.table.fileType,
  };
}

/** Индексы колонок по нормализованному заголовку. */
export function columnIndex(header: string[]): Map<string, number> {
  const map = new Map<string, number>();
  header.forEach((name, index) => {
    const key = normalizeText(name);
    if (key && !map.has(key)) map.set(key, index);
  });
  return map;
}

/** Ячейки строки по названиям колонок — для import_rows.raw. */
export function rawCells(header: string[], cells: string[]): Record<string, string> {
  const raw: Record<string, string> = {};
  header.forEach((name, index) => {
    const value = cells[index] ?? '';
    if (value) raw[name || `#${index + 1}`] = value;
  });
  cells.slice(header.length).forEach((value, offset) => {
    if (value) raw[`#${header.length + offset + 1}`] = value;
  });
  return raw;
}
