import { describe, expect, it } from 'vitest';
import { decodeText, normalizeDescription, dedupHash, dedupSequence, parseAmount, parseCurrency, parseDateTime } from '../src';
import { detectDelimiter } from '../src/csv';
import { guessDateFormat } from '../src/dates';
import { findHeader, sniffFileType } from '../src/table';

describe('суммы', () => {
  it.each([
    ['1 234,56', '1234.56'],
    ['1 234,56', '1234.56'],
    ['1 234,5', '1234.50'],
    ['−1 234,50', '-1234.50'],
    ['-1234.5', '-1234.50'],
    ['+85 000,00 ₽', '85000.00'],
    ['1 234,56 руб.', '1234.56'],
    ['500 RUB', '500.00'],
    ['(100,00)', '-100.00'],
    ['1234,50-', '-1234.50'],
    ['1,234.56', '1234.56'],
    ['1.234,56', '1234.56'],
    ['1,234', '1234.00'],
    ['0,00', '0.00'],
    ['-0,00', '0.00'],
    ['007', '7.00'],
  ])('%s → %s', (input, expected) => expect(parseAmount(input)).toBe(expected));

  it.each(['', 'abc', '12,345,67', '1,234.567', '--5', '1.2.3'])('«%s» — не сумма', (input) => expect(parseAmount(input)).toBeNull());

  it('явный десятичный разделитель', () => {
    expect(parseAmount('1.234', ',')).toBe('1234.00');
    expect(parseAmount('1,23', '.')).toBe('123.00');
  });

  it('валюты', () => {
    expect(parseCurrency('RUR')).toBe('RUB');
    expect(parseCurrency('руб.')).toBe('RUB');
    expect(parseCurrency('usd')).toBe('USD');
    expect(parseCurrency('рубли')).toBeNull();
  });
});

describe('даты', () => {
  it.each([
    ['31.12.2025 18:45:12', { date: '2025-12-31', time: '18:45:12' }],
    ['31.12.2025', { date: '2025-12-31', time: null }],
    ['01.08.26', { date: '2026-08-01', time: null }],
    ['2026-07-03', { date: '2026-07-03', time: null }],
    ['2026-07-03T09:05:00Z', { date: '2026-07-03', time: '09:05:00' }],
    ['3/7/2026 9:05', { date: '2026-07-03', time: '09:05:00' }],
    ['31.12.2025, 18:45', { date: '2025-12-31', time: '18:45:00' }],
    [46022.75, { date: '2025-12-31', time: '18:00:00' }],
    ['46022', { date: '2025-12-31', time: null }],
  ])('%s', (input, expected) => expect(parseDateTime(input)).toEqual(expected));

  it.each(['31.02.2026', '32.01.2026', '2026-13-01', '12.10.2026 25:00', 'вчера', '1234', 1234.5])('«%s» — не дата', (input) => expect(parseDateTime(input)).toBeNull());

  it('американский порядок — только явно', () => {
    expect(parseDateTime('07/03/2026')?.date).toBe('2026-03-07');
    expect(parseDateTime('07/03/2026', 'MM/DD/YYYY')?.date).toBe('2026-07-03');
    expect(guessDateFormat(['12/31/2026', '01/15/2026'])).toBe('MM/DD/YYYY');
    expect(guessDateFormat(['31.12.2026'])).toBe('DD.MM.YYYY');
  });
});

describe('текст и CSV', () => {
  it('кодировки: BOM, UTF-8, windows-1251', () => {
    expect(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, 0xd0, 0x9f]))).toEqual({ text: 'П', encoding: 'utf-8' });
    expect(decodeText(new TextEncoder().encode('Пятёрочка')).text).toBe('Пятёрочка');
    expect(decodeText(new Uint8Array([0xcf, 0xff, 0xf2, 0xb8, 0xf0, 0xee, 0xf7, 0xea, 0xe0]))).toEqual({ text: 'Пятёрочка', encoding: 'windows-1251' });
  });

  it('разделитель — вне кавычек', () => {
    expect(detectDelimiter('a;b;c\n1;2;3')).toBe(';');
    expect(detectDelimiter('a,b,c\n"1;2",2,3')).toBe(',');
    expect(detectDelimiter('a\tb\tc\n1\t2,5\t3')).toBe('\t');
    expect(detectDelimiter('Дата;Сумма\n01.01.2026;1,50')).toBe(';');
  });

  it('тип файла — по содержимому, не по имени', () => {
    expect(sniffFileType(new TextEncoder().encode('%PDF-1.7\n...'))).toBe('pdf');
    expect(sniffFileType(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))).toBe('xls');
    expect(sniffFileType(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]))).toBeNull(); // zip без xl/ — не таблица
    expect(sniffFileType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]))).toBeNull(); // PNG
    expect(sniffFileType(new TextEncoder().encode('Дата;Сумма\n'))).toBe('csv');
    expect(sniffFileType(new Uint8Array())).toBeNull();
  });

  it('заголовок после шапки выписки', () => {
    const rows = [['Выписка по счёту'], ['Период: 01.08.26 - 31.08.26', ''], [], ['Дата', 'Описание', 'Сумма'], ['01.08.2026', 'Магнит', '-100']];
    expect(findHeader(rows)).toBe(3);
    expect(findHeader([['a', 'b'], ['c', 'd']])).toBeNull();
  });
});

describe('ключ дедупликации', () => {
  it('нормализация описания убирает переменные части', () => {
    expect(normalizeDescription('Оплата ЖКУ 15.08.2026 12:00 код 123456789')).toBe('оплата жку код');
    expect(normalizeDescription('Оплата: "Магнит", карта *5531')).toBe('оплата: "магнит",');
    expect(normalizeDescription('ПЯТЁРОЧКА •• 1234')).toBe('пятерочка');
    expect(normalizeDescription('Перевод 4276 38** **** 1234 ref 2026-10-01')).toBe('перевод ref');
    expect(normalizeDescription('Метро 12345')).toBe('метро 12345'); // 5 цифр — не референс
    expect(normalizeDescription('x'.repeat(150))).toHaveLength(100);
  });

  it('один хеш у одной операции из двух выписок, разный — у разных сумм и счетов', () => {
    const base = { accountId: 'a1', date: '2026-10-12', amount: '-250.00', currency: 'RUB', description: 'Кофейня Зерно *1188' };
    expect(dedupHash(base)).toBe(dedupHash({ ...base, amount: '-250.0', description: 'КОФЕЙНЯ ЗЕРНО' }));
    expect(dedupHash(base)).not.toBe(dedupHash({ ...base, amount: '-250.01' }));
    expect(dedupHash(base)).not.toBe(dedupHash({ ...base, accountId: 'a2' }));
    expect(dedupHash(base)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('dedup_seq: одинаковые покупки в один день — 1 и 2', () => {
    expect(dedupSequence(['h1', 'h2', 'h1', 'h1', 'h3'])).toEqual([1, 1, 2, 3, 1]);
  });
});
