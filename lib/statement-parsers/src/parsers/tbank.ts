import { parseDateTime } from '../dates';
import { parseAmount, parseCurrency } from '../numbers';
import { summarize } from '../statement';
import { columnIndex, rawCells, type HeadedTable } from '../table';
import { StatementError, type ParsedRow, type ParsedStatement, type RowStatus } from '../types';
import type { TableParser } from './types';

/**
 * Выписка Т-Банка из веб-версии («Операции» → период → выгрузка) — CSV (`;`, windows-1251 или UTF-8 с BOM) и XLSX
 * с одинаковыми колонками: Дата операции; Дата платежа; Номер карты; Статус; Сумма операции; Валюта операции;
 * Сумма платежа; Валюта платежа; Кэшбэк; Категория; MCC; Описание; Бонусы (включая кэшбэк); …
 * «Сумма платежа» — в валюте карты (её и берём), «Сумма операции» — в валюте покупки. Обе со знаком.
 * Статус OK — проведена, FAILED — отклонена (не импортируется), WAITING — блокировка (холд).
 */
const REQUIRED = ['дата операции', 'статус', 'сумма операции', 'валюта операции', 'сумма платежа', 'валюта платежа', 'описание'];

const STATUS: Record<string, RowStatus> = { ok: 'posted', failed: 'failed', waiting: 'pending', 'в обработке': 'pending', отклонена: 'failed' };

function parse(headed: HeadedTable, parserCode: string): ParsedStatement {
  const col = columnIndex(headed.header);
  const get = (cells: string[], name: string) => {
    const i = col.get(name);
    return i === undefined ? '' : (cells[i] ?? '');
  };
  const rows: ParsedRow[] = [];
  let unreadable = 0;
  const unknownStatuses = new Set<string>();
  for (const { rowIndex, cells } of headed.data) {
    const when = parseDateTime(get(cells, 'дата операции'));
    const amount = parseAmount(get(cells, 'сумма платежа'));
    const currency = parseCurrency(get(cells, 'валюта платежа'));
    if (!when || amount === null || !currency) {
      unreadable++;
      continue;
    }
    const operationAmount = parseAmount(get(cells, 'сумма операции'));
    const operationCurrency = parseCurrency(get(cells, 'валюта операции'));
    const foreign = operationCurrency && operationCurrency !== currency && operationAmount !== null;
    const statusText = get(cells, 'статус').trim().toLowerCase();
    const status = STATUS[statusText] ?? 'posted';
    if (statusText && !STATUS[statusText]) unknownStatuses.add(get(cells, 'статус'));
    const description = get(cells, 'описание').trim() || 'Без описания';
    const cashback = parseAmount(get(cells, 'кэшбэк'));
    rows.push({
      rowIndex,
      date: when.date,
      time: when.time,
      postedDate: parseDateTime(get(cells, 'дата платежа'))?.date ?? null,
      amount,
      currency,
      originalAmount: foreign ? operationAmount : null,
      originalCurrency: foreign ? operationCurrency : null,
      description,
      merchant: description,
      mcc: get(cells, 'mcc').match(/^\d{4}$/)?.[0] ?? null,
      bankCategory: get(cells, 'категория') || null,
      cardLast4: get(cells, 'номер карты').match(/(\d{4})\s*$/)?.[1] ?? null,
      externalId: null,
      authCode: null,
      status,
      balanceAfter: null,
      cashback: cashback && cashback !== '0.00' ? cashback : null,
      raw: rawCells(headed.header, cells),
    });
  }
  if (!rows.length && unreadable) throw new StatementError('FORMAT_NOT_RECOGNIZED', 'Похоже на выписку Т-Банка, но операции прочитать не удалось. Скачайте выписку заново в CSV из веб-версии.');
  const warnings: string[] = [];
  if (unreadable) warnings.push(`Пропущено строк без даты или суммы: ${unreadable}`);
  if (unknownStatuses.size) warnings.push(`Незнакомые статусы операций (считаем проведёнными): ${[...unknownStatuses].join(', ')}`);
  return summarize({ parserCode, institution: 'tbank', rows, warnings });
}

export const tbankCsv: TableParser = {
  code: 'tbank_csv@1',
  institution: 'tbank',
  fileType: 'csv',
  detect: (headed) => (REQUIRED.every((name) => columnIndex(headed.header).has(name)) ? 0.95 : 0),
  parse: (headed) => parse(headed, 'tbank_csv@1'),
};

export const tbankXlsx: TableParser = {
  code: 'tbank_xlsx@1',
  institution: 'tbank',
  fileType: 'xlsx',
  detect: tbankCsv.detect,
  parse: (headed) => parse(headed, 'tbank_xlsx@1'),
};
