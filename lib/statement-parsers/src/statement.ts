import type { ParsedRow, ParsedStatement } from './types';

/** Итог выписки по строкам: валюта счёта (самая частая), период, карты; остальное парсер задаёт сам. */
export function summarize(input: { parserCode: string; institution: string | null; rows: ParsedRow[]; warnings: string[] } & Partial<ParsedStatement>): ParsedStatement {
  const { rows } = input;
  const currencies = new Map<string, number>();
  for (const row of rows) if (row.status !== 'failed') currencies.set(row.currency, (currencies.get(row.currency) ?? 0) + 1);
  const accountCurrency = input.accountCurrency ?? ([...currencies.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null);
  const warnings = [...input.warnings];
  if (currencies.size > 1) warnings.push(`В выписке операции в нескольких валютах: ${[...currencies.keys()].join(', ')}`);
  const dates = rows.map((row) => row.date).sort();
  const cards = [...new Set(rows.map((row) => row.cardLast4).filter((card): card is string => !!card))].sort();
  return {
    parserCode: input.parserCode,
    institution: input.institution,
    accountCurrency,
    accountNumberMasked: input.accountNumberMasked ?? null,
    cardLast4: input.cardLast4 ?? cards,
    periodFrom: input.periodFrom ?? dates[0] ?? null,
    periodTo: input.periodTo ?? dates[dates.length - 1] ?? null,
    openingBalance: input.openingBalance ?? null,
    closingBalance: input.closingBalance ?? null,
    rows,
    warnings,
  };
}
