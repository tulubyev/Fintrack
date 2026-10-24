import { parse } from 'csv-parse/sync';
import { LIMITS, StatementError } from './types';

/** Разделитель CSV — по счёту «;», «,» и табуляции в первых 5 строках вне кавычек. */
export function detectDelimiter(text: string): ';' | ',' | '\t' {
  const counts = { ';': 0, ',': 0, '\t': 0 };
  let inQuotes = false;
  let lines = 0;
  for (const char of text) {
    if (char === '"') inQuotes = !inQuotes;
    else if (!inQuotes && char === '\n' && ++lines >= 5) break;
    else if (!inQuotes && char in counts) counts[char as keyof typeof counts]++;
  }
  // при равенстве — «;»: в русских выгрузках запятая часто стоит в суммах
  return counts['\t'] > counts[';'] && counts['\t'] > counts[','] ? '\t' : counts[','] > counts[';'] ? ',' : ';';
}

export function readCsv(text: string, maxRows: number = LIMITS.maxRows): { rows: string[][]; delimiter: string } {
  let lines = 0;
  for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) {
    if (++lines > maxRows + 1000) throw new StatementError('TOO_MANY_ROWS', `В выписке больше ${maxRows.toLocaleString('ru-RU')} строк. Скачайте её за меньший период.`);
  }
  const delimiter = detectDelimiter(text);
  try {
    const rows: string[][] = parse(text, { delimiter, relax_column_count: true, relax_quotes: true, skip_empty_lines: false, trim: false });
    return { rows, delimiter };
  } catch {
    throw new StatementError('FORMAT_NOT_RECOGNIZED', 'Не удалось прочитать CSV: файл повреждён. Скачайте выписку заново.');
  }
}
