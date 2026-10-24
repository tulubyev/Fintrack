import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { detect, parseStatement, StatementError, type ParseResult } from '../src';
import { readXlsx } from '../src/xlsx';
import { excelSerial, makeXlsx, zip, type Cell } from './helpers/xlsx';

const fixture = (name: string) => new Uint8Array(readFileSync(join(import.meta.dirname, 'fixtures', name)));
const file = (bytes: Uint8Array, name = 'statement') => ({ name, bytes });
const text = (value: string) => file(new TextEncoder().encode(value), 'x.csv');
const parsed = (result: ParseResult) => {
  if (result.status !== 'parsed') throw new Error(`ожидали parsed, получили ${result.status}`);
  return result.statement;
};
async function errorCode(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(StatementError);
    return (error as StatementError).code;
  }
  throw new Error('ожидали ошибку');
}

/** Строки фикстуры Т-Банка как ячейки XLSX: даты — серийными числами со стилем, суммы — числами. */
function tbankAsXlsx(): Uint8Array {
  const lines = new TextDecoder('windows-1251').decode(fixture('tbank-cp1251.csv')).trim().split(/\r?\n/);
  const rows: Cell[][] = lines.map((line, index) =>
    line.split(';').map((value, column) => {
      const cell = value.replace(/^"|"$/g, '');
      if (index === 0 || cell === '') return cell;
      if (column === 0) return { date: excelSerial(...(cell.split(' ') as [string, string])), time: true };
      if (column === 1) return { date: excelSerial(cell) };
      if ([4, 6].includes(column)) return Number(cell.replace(/\s/g, '').replace(',', '.'));
      return cell;
    }),
  );
  return makeXlsx(rows);
}

describe('Т-Банк', () => {
  it('XLSX даёт те же операции, что CSV', async () => {
    const fromCsv = parsed(await parseStatement(file(fixture('tbank-cp1251.csv'))));
    const fromXlsx = parsed(await parseStatement(file(tbankAsXlsx())));
    expect(fromXlsx.parserCode).toBe('tbank_xlsx@1');
    const strip = (rows: typeof fromCsv.rows) => rows.map(({ raw, ...row }) => row);
    expect(strip(fromXlsx.rows)).toEqual(strip(fromCsv.rows));
  });

  it('распознаётся без подсказки; универсальный — запасной вариант', () => {
    expect(detect(file(fixture('tbank-utf8-bom.csv')))).toEqual([
      { parserCode: 'tbank_csv@1', score: 0.95 },
      { parserCode: 'generic_csv@1', score: 0.1 },
    ]);
  });

  it('одинаковые покупки в один день остаются двумя строками', async () => {
    const statement = parsed(await parseStatement(file(fixture('tbank-utf8-bom.csv'))));
    expect(statement.rows.filter((row) => row.description === 'Кофейня Зерно')).toHaveLength(2);
    expect(statement.rows.find((row) => row.description.startsWith('Перевод от'))).toMatchObject({ amount: '1200.00', cardLast4: null });
  });
});

describe('универсальный импорт', () => {
  it('незнакомый CSV → needs_mapping с предложением; приход и расход — split', async () => {
    const result = await parseStatement(file(fixture('generic-split.csv')));
    expect(result.status).toBe('needs_mapping');
    if (result.status !== 'needs_mapping') return;
    expect(result.table.headerRowIndex).toBe(3);
    expect(result.table.rows).toHaveLength(5);
    expect(result.suggested).toEqual({
      date: 'Дата операции',
      description: 'Описание операции',
      income: 'Приход',
      expense: 'Расход',
      signConvention: 'split',
      currency: 'Валюта',
      dateFormat: 'DD.MM.YYYY',
    });
    // предложение применимо как есть
    expect(parsed(await parseStatement(file(fixture('generic-split.csv')), { mapping: result.suggested! })).rows).toHaveLength(4);
  });

  it('запомненное сопоставление находится по отпечатку заголовка', async () => {
    const first = await parseStatement(file(fixture('generic-signed-en.csv')));
    if (first.status !== 'needs_mapping') throw new Error();
    const again = await parseStatement(file(fixture('generic-signed-en.csv')), { mappings: { [first.table.fingerprint]: first.suggested! } });
    expect(parsed(again).rows.map((row) => row.amount)).toEqual(['-3.50', '2500.00', '-1200.00']);
    // тот же заголовок в другом регистре и с лишними пробелами — тот же отпечаток
    const other = await parseStatement(text('DATE , description,Amount,currency\n2026-07-05,Taxi,-9.90,EUR\n'));
    expect(other.status === 'needs_mapping' && other.table.fingerprint).toBe(first.table.fingerprint);
  });

  it('расходы положительные — знак меняется', async () => {
    const result = await parseStatement(text('Дата;Описание;Сумма\n01.10.2026;Магнит;1 500,00\n02.10.2026;Возврат;-200,00\n'), {
      mapping: { date: 'Дата', description: 'Описание', amount: 'Сумма', signConvention: 'expense_positive' },
    });
    expect(parsed(result).rows.map((row) => row.amount)).toEqual(['-1500.00', '200.00']);
  });

  it('нечитаемые строки — в предупреждение, нулевые суммы пропускаются', async () => {
    const result = await parseStatement(text('Дата;Описание;Сумма\n01.10.2026;Магнит;-10\nкривая;строка;тут\n02.10.2026;Ноль;0\n'), {
      mapping: { date: 'Дата', description: 'Описание', amount: 'Сумма', signConvention: 'signed' },
    });
    expect(parsed(result).rows).toHaveLength(1);
    expect(parsed(result).warnings).toEqual(['Пропущено строк без даты или суммы: 1']);
  });

  it('XLSX с inline-строками и шапкой', async () => {
    const bytes = makeXlsx(
      [['Выписка'], [], ['Дата', 'Назначение', 'Сумма'], [{ date: excelSerial('01.10.2026') }, 'Аптека', -450.5], [{ date: excelSerial('02.10.2026') }, 'Кэшбэк', 120]],
      { inlineStrings: true },
    );
    const result = await parseStatement(file(bytes));
    if (result.status !== 'needs_mapping') throw new Error();
    expect(result.table.fileType).toBe('xlsx');
    const statement = parsed(await parseStatement(file(bytes), { mapping: result.suggested! }));
    expect(statement.parserCode).toBe('generic_xlsx@1');
    expect(statement.rows.map((row) => [row.date, row.amount, row.description])).toEqual([
      ['2026-10-01', '-450.50', 'Аптека'],
      ['2026-10-02', '120.00', 'Кэшбэк'],
    ]);
  });

  it('колонки нет в файле → BAD_MAPPING', async () => {
    const promise = parseStatement(file(fixture('generic-signed-en.csv')), { mapping: { date: 'Дата', description: 'Description', amount: 'Amount', signConvention: 'signed' } });
    expect(await errorCode(promise)).toBe('BAD_MAPPING');
  });
});

describe('XLSX', () => {
  it('общие строки, пропуски ячеек, экранирование, даты по стилю', () => {
    const bytes = makeXlsx([
      ['A & B', null, '<x>'],
      [{ date: excelSerial('31.12.2025', '18:45:12'), time: true }, 1234.5000000001, { date: excelSerial('01.01.2026') }],
    ]);
    expect(readXlsx(bytes)).toEqual([
      ['A & B', '', '<x>'],
      ['2025-12-31 18:45:12', '1234.5', '2026-01-01'],
    ]);
  });

  it('zip-бомба: распаковка ограничена', () => {
    const bomb = makeXlsx([['x']], { extraFiles: { 'xl/worksheets/sheet1.xml': `<worksheet><sheetData>${'<row/>'.repeat(200_000)}</sheetData></worksheet>` } });
    expect(() => readXlsx(bomb, { maxUncompressedBytes: 100_000, maxRows: 50_000 })).toThrow(/слишком большой/);
  });

  it('битый архив — понятная ошибка', () => {
    const broken = zip({ '[Content_Types].xml': '<Types/>', 'xl/workbook.xml': '<workbook/>' }).slice(0, 60);
    expect(() => readXlsx(broken)).toThrow(StatementError);
  });
});

describe('ошибки', () => {
  it.each([
    ['PDF', new TextEncoder().encode('%PDF-1.7 ...'), 'FORMAT_NOT_RECOGNIZED'],
    ['XLS', new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), 'UNSUPPORTED_FILE'],
    ['картинка', new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]), 'UNSUPPORTED_FILE'],
    ['пустой CSV', new TextEncoder().encode('Дата;Сумма\n'), 'EMPTY_STATEMENT'],
  ])('%s', async (_, bytes, code) => {
    expect(await errorCode(parseStatement(file(bytes)))).toBe(code);
  });

  it('Т-Банк только с отклонёнными строками без дат → FORMAT_NOT_RECOGNIZED', async () => {
    const header = new TextDecoder().decode(fixture('tbank-utf8-bom.csv')).replace(/^﻿/, '').split('\n')[0];
    expect(await errorCode(parseStatement(text(`${header}\n01.10.2026;;;OK;-1;RUB;кривая;RUB;;;;x;;;\n`)))).toBe('FORMAT_NOT_RECOGNIZED');
  });
});
