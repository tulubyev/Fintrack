import { parseWithMapping, suggestMapping, GENERIC_VERSION } from './generic';
import { tbankCsv, tbankXlsx } from './parsers/tbank';
import type { TableParser } from './parsers/types';
import { headTable, preview, readTable, sniffFileType, type HeadedTable } from './table';
import { LIMITS, StatementError, type ParseOptions, type ParseResult, type ParsedStatement, type StatementFile } from './types';

export * from './types';
export { parseAmount, parseCurrency, toKopecks, fromKopecks } from './numbers';
export { parseDate, parseDateTime } from './dates';
export { decodeText, normalizeText } from './text';
export { sniffFileType, headerFingerprint } from './table';
export { normalizeDescription, dedupHash, dedupSequence } from './dedup';
export { suggestMapping } from './generic';

const TABLE_PARSERS: TableParser[] = [tbankCsv, tbankXlsx];

export const PARSER_CODES = [...TABLE_PARSERS.map((parser) => parser.code), `generic_csv@${GENERIC_VERSION}`, `generic_xlsx@${GENERIC_VERSION}`];

function open(file: StatementFile): HeadedTable {
  const type = sniffFileType(file.bytes);
  if (type === null) throw new StatementError('UNSUPPORTED_FILE', 'Этот файл не похож на выписку. Загрузите CSV, Excel (XLSX) или PDF из банка.');
  if (type === 'xls') throw new StatementError('UNSUPPORTED_FILE', 'Старый формат Excel (XLS) пока не читаем. Откройте файл в Excel и сохраните как XLSX или CSV.');
  if (type === 'pdf') throw new StatementError('FORMAT_NOT_RECOGNIZED', 'PDF-выписки пока не поддерживаются. Скачайте выписку в CSV или Excel из веб-версии банка.');
  return headTable(readTable(file.bytes, type));
}

/** Какие парсеры подходят файлу, по убыванию уверенности. Универсальный — всегда последним, с низкой оценкой. */
export function detect(file: StatementFile): Array<{ parserCode: string; score: number }> {
  const headed = open(file);
  return [
    ...TABLE_PARSERS.filter((parser) => parser.fileType === headed.table.fileType)
      .map((parser) => ({ parserCode: parser.code, score: parser.detect(headed) }))
      .filter((match) => match.score > 0)
      .sort((a, b) => b.score - a.score),
    { parserCode: `generic_${headed.table.fileType}@${GENERIC_VERSION}`, score: 0.1 },
  ];
}

/**
 * Разбор выписки. Порядок: явный parserCode → парсер банка (уверенность ≥ 0.5) → сопоставление от пользователя или
 * запомненное по отпечатку заголовка → needs_mapping с предложением. Ошибки — StatementError с кодом и текстом.
 * async — под PDF (T7): pdfjs работает асинхронно.
 */
export async function parseStatement(file: StatementFile, options: ParseOptions = {}): Promise<ParseResult> {
  const headed = open(file);
  const candidates = TABLE_PARSERS.filter((parser) => parser.fileType === headed.table.fileType);
  const explicit = options.parserCode && !options.parserCode.startsWith('generic_') ? candidates.find((parser) => parser.code === options.parserCode) : undefined;
  const best = explicit ?? (options.mapping ? undefined : candidates.map((parser) => ({ parser, score: parser.detect(headed) })).filter((m) => m.score >= 0.5).sort((a, b) => b.score - a.score)[0]?.parser);
  if (best) return { status: 'parsed', statement: check(best.parse(headed)) };

  const table = preview(headed);
  const mapping = options.mapping ?? options.mappings?.[table.fingerprint];
  if (mapping) return { status: 'parsed', statement: check(parseWithMapping(headed, mapping)) };
  return { status: 'needs_mapping', table, suggested: suggestMapping(headed) };
}

function check(statement: ParsedStatement): ParsedStatement {
  if (!statement.rows.length) throw new StatementError('EMPTY_STATEMENT', 'В файле нет операций. Проверьте период выписки и скачайте её заново.');
  if (statement.rows.length > LIMITS.maxRows) throw new StatementError('TOO_MANY_ROWS', `В выписке больше ${LIMITS.maxRows.toLocaleString('ru-RU')} операций. Скачайте её за меньший период.`);
  return statement;
}
