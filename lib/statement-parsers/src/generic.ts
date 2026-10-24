import { guessDateFormat, parseDateTime } from './dates';
import { negate, parseAmount, parseCurrency } from './numbers';
import { columnIndex, rawCells, type HeadedTable } from './table';
import { normalizeText } from './text';
import { StatementError, type ColumnMapping, type ParsedRow, type ParsedStatement } from './types';
import { summarize } from './statement';

export const GENERIC_VERSION = 1;

/** Колонки, которые узнаём по названию. Первый подходящий шаблон выигрывает — «дата операции» важнее «даты платежа». */
const GUESS: Array<[keyof ColumnMapping, RegExp[]]> = [
  ['date', [/^дата (совершения )?операции$/, /^дата$/, /^date$/, /^дата( и время)?( операции)?/, /дата/]],
  ['income', [/^приход/, /поступлени/, /зачислени/, /^кредит$/, /^credit$/, /^пополнени/]],
  ['expense', [/^расход/, /списани/, /^дебет$/, /^debit$/]],
  ['amount', [/^сумма (операции|платежа)?$/, /^сумма в валюте (счета|карты)/, /^amount$/, /^сумма(?!.*(кэшбэк|кешбэк|бонус|округлен|комисс))/]],
  ['description', [/^описание( операции)?$/, /^назначение( платежа)?$/, /^description$/, /описание/, /назначение/, /контрагент|получатель|наименование/]],
  ['currency', [/^валюта( операции| платежа| счета)?$/, /^currency$/]],
  ['mcc', [/^mcc$/, /мсс|mcc/]],
  ['category', [/^категория/, /^category$/]],
];

/** Предложение сопоставления по названиям колонок; null — если не нашли дату, описание или сумму. */
export function suggestMapping(headed: HeadedTable): ColumnMapping | null {
  const names = headed.header.map(normalizeText);
  const used = new Set<number>();
  const found: Partial<Record<keyof ColumnMapping, string>> = {};
  for (const [field, patterns] of GUESS) {
    for (const pattern of patterns) {
      const index = names.findIndex((name, i) => name && !used.has(i) && pattern.test(name));
      if (index !== -1) {
        found[field] = headed.header[index];
        used.add(index);
        break;
      }
    }
  }
  if (!found.date || !found.description) return null;
  const split = found.income && found.expense;
  if (!found.amount && !split) return null;
  const dateIndex = names.indexOf(normalizeText(found.date));
  return {
    date: found.date,
    description: found.description,
    ...(split && !found.amount ? { income: found.income, expense: found.expense, signConvention: 'split' as const } : { amount: found.amount, signConvention: 'signed' as const }),
    ...(found.currency ? { currency: found.currency } : {}),
    ...(found.mcc ? { mcc: found.mcc } : {}),
    ...(found.category ? { category: found.category } : {}),
    dateFormat: guessDateFormat(headed.data.slice(0, 50).map((row) => row.cells[dateIndex] ?? '')),
  };
}

/** Строки, которые не операции: итоги, остатки, обороты. */
const SUMMARY = /итог|остаток|всего|оборот|баланс|сальдо|total|balance/i;

/** Универсальный импорт CSV/XLSX по сопоставлению колонок (generic_csv@1, generic_xlsx@1). */
export function parseWithMapping(headed: HeadedTable, mapping: ColumnMapping): ParsedStatement {
  const index = columnIndex(headed.header);
  const column = (name: string | undefined, required: boolean) => {
    if (!name) return undefined;
    const i = index.get(normalizeText(name));
    if (i === undefined && required) throw new StatementError('BAD_MAPPING', `В файле нет колонки «${name}». Выберите колонки заново.`);
    return i;
  };
  const dateCol = column(mapping.date, true)!;
  const descriptionCol = column(mapping.description, true)!;
  const amountCol = mapping.signConvention === 'split' ? undefined : column(mapping.amount ?? '', true);
  const incomeCol = mapping.signConvention === 'split' ? column(mapping.income, true) : undefined;
  const expenseCol = mapping.signConvention === 'split' ? column(mapping.expense, true) : undefined;
  if (mapping.signConvention !== 'split' && amountCol === undefined) throw new StatementError('BAD_MAPPING', 'Выберите колонку с суммой.');
  if (mapping.signConvention === 'split' && (incomeCol === undefined || expenseCol === undefined)) throw new StatementError('BAD_MAPPING', 'Выберите колонки прихода и расхода.');
  const currencyCol = column(mapping.currency, false);
  const mccCol = column(mapping.mcc, false);
  const categoryCol = column(mapping.category, false);
  const fallbackCurrency = parseCurrency(mapping.defaultCurrency) ?? 'RUB';

  const rows: ParsedRow[] = [];
  const warnings: string[] = [];
  let unreadable = 0;
  for (const { rowIndex, cells } of headed.data) {
    const cell = (i: number | undefined) => (i === undefined ? '' : (cells[i] ?? ''));
    const when = parseDateTime(cell(dateCol), mapping.dateFormat);
    let amount: string | null;
    if (mapping.signConvention === 'split') {
      const income = parseAmount(cell(incomeCol));
      const expense = parseAmount(cell(expenseCol));
      amount = income && income !== '0.00' ? income.replace(/^-/, '') : expense && expense !== '0.00' ? `-${expense.replace(/^-/, '')}` : null;
    } else {
      amount = parseAmount(cell(amountCol));
      if (amount && mapping.signConvention === 'expense_positive') amount = negate(amount);
    }
    if (!when || amount === null) {
      // итоговые строки и шапки страниц пропускаем молча, остальное — в предупреждения
      if (!cells.some((value) => SUMMARY.test(value)) && cells.filter(Boolean).length > 1) unreadable++;
      continue;
    }
    if (amount === '0.00') continue;
    const description = cell(descriptionCol) || 'Без описания';
    const mcc = cell(mccCol).match(/^\d{4}$/)?.[0] ?? null;
    rows.push({
      rowIndex,
      date: when.date,
      time: when.time,
      postedDate: null,
      amount,
      currency: parseCurrency(cell(currencyCol)) ?? fallbackCurrency,
      originalAmount: null,
      originalCurrency: null,
      description,
      merchant: null,
      mcc,
      bankCategory: cell(categoryCol) || null,
      cardLast4: null,
      externalId: null,
      authCode: null,
      status: 'posted',
      balanceAfter: null,
      cashback: null,
      raw: rawCells(headed.header, cells),
    });
  }
  if (unreadable) warnings.push(`Пропущено строк без даты или суммы: ${unreadable}`);
  const code = `generic_${headed.table.fileType}@${GENERIC_VERSION}`;
  return summarize({ parserCode: code, institution: null, rows, warnings });
}
