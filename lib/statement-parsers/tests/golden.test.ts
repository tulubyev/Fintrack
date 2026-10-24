import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseStatement, toKopecks, fromKopecks, type ColumnMapping, type ParseResult } from '../src';

/**
 * Golden-тесты: синтетическая выписка (вымышленные данные той же структуры, что у банка) → эталонный JSON.
 * Эталон обновляется командой `UPDATE_GOLDEN=1 pnpm --filter @workspace/statement-parsers test` — и затем
 * просматривается глазами в диффе PR: число строк, суммы, даты, описания и статусы должны совпадать до копейки.
 */
const fixtures = join(import.meta.dirname, 'fixtures');
const golden = join(import.meta.dirname, 'golden');

const CASES: Array<{ name: string; file: string; mapping?: ColumnMapping }> = [
  { name: 'tbank-cp1251', file: 'tbank-cp1251.csv' },
  { name: 'tbank-utf8-bom', file: 'tbank-utf8-bom.csv' },
  { name: 'generic-split', file: 'generic-split.csv', mapping: { date: 'Дата операции', description: 'Описание операции', income: 'Приход', expense: 'Расход', currency: 'Валюта', signConvention: 'split' } },
  { name: 'generic-signed-en', file: 'generic-signed-en.csv', mapping: { date: 'Date', description: 'Description', amount: 'Amount', currency: 'Currency', signConvention: 'signed' } },
  { name: 'generic-signed-en-needs-mapping', file: 'generic-signed-en.csv' },
];

describe('golden: выписка → эталон', () => {
  for (const testCase of CASES) {
    it(testCase.name, async () => {
      const bytes = new Uint8Array(readFileSync(join(fixtures, testCase.file)));
      const result = await parseStatement({ name: testCase.file, bytes }, testCase.mapping ? { mapping: testCase.mapping } : {});
      const path = join(golden, `${testCase.name}.json`);
      const actual = JSON.parse(JSON.stringify(result));
      if (process.env.UPDATE_GOLDEN || !existsSync(path)) writeFileSync(path, `${JSON.stringify(actual, null, 2)}\n`);
      expect(actual).toEqual(JSON.parse(readFileSync(path, 'utf8')));
    });
  }
});

const sum = (result: ParseResult, filter: (amount: string, status: string) => boolean = () => true) =>
  result.status === 'parsed' ? fromKopecks(result.statement.rows.filter((row) => filter(row.amount, row.status)).reduce((total, row) => total + toKopecks(row.amount), 0n)) : null;

describe('golden: контрольные суммы', () => {
  it('Т-Банк windows-1251: проведённые операции и отклонённая отдельно', async () => {
    const result = await parseStatement({ name: 't.csv', bytes: new Uint8Array(readFileSync(join(fixtures, 'tbank-cp1251.csv'))) });
    expect(result.status).toBe('parsed');
    if (result.status !== 'parsed') return;
    const { statement } = result;
    expect(statement.parserCode).toBe('tbank_csv@1');
    expect(statement.rows).toHaveLength(7);
    expect(sum(result, (_, status) => status === 'posted')).toBe('82501.10'); // 85000 − 1234.50 − 250 − 925.40 − 89
    expect(statement.rows.find((row) => row.status === 'failed')?.description).toBe('Перевод по номеру телефона');
    expect(statement.rows.find((row) => row.status === 'pending')?.amount).toBe('-3500.00');
    expect(statement.rows.find((row) => row.mcc === '5734')).toMatchObject({ amount: '-925.40', currency: 'RUB', originalAmount: '-10.00', originalCurrency: 'USD' });
    expect(statement.cardLast4).toEqual(['4417', '9021']);
    expect([statement.periodFrom, statement.periodTo]).toEqual(['2026-09-24', '2026-09-30']);
    expect(statement.accountCurrency).toBe('RUB');
  });

  it('универсальный: приход и расход в разных колонках, шапка и «Итого» пропущены', async () => {
    const bytes = new Uint8Array(readFileSync(join(fixtures, 'generic-split.csv')));
    const result = await parseStatement({ name: 'a.csv', bytes }, { mapping: CASES[2].mapping });
    expect(sum(result)).toBe('112150.70'); // 120 000,00 − 7 849,30 — как в строке «Итого обороты»
    expect(result.status === 'parsed' && result.statement.warnings).toEqual([]);
  });
});
