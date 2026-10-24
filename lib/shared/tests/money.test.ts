import { describe, expect, it } from 'vitest';
import { formatMoney, fromKopecks, parseMoneyInput, toKopecks } from '../src/money';

describe('деньги (D11)', () => {
  it('разбор ввода в строку API', () => {
    expect(parseMoneyInput('1 234,5')).toBe('1234.50');
    expect(parseMoneyInput('−500')).toBe('-500.00');
    expect(parseMoneyInput('007')).toBe('7.00');
    expect(parseMoneyInput('-1', { allowNegative: false })).toBeNull();
    expect(parseMoneyInput('1.234')).toBeNull();
    expect(parseMoneyInput('abc')).toBeNull();
  });

  it('копейки туда и обратно без потери точности', () => {
    expect(toKopecks('-1234.5')).toBe(-123450n);
    expect(fromKopecks(toKopecks('0.1') + toKopecks('0.2'))).toBe('0.30');
    expect(fromKopecks(toKopecks('90000000000000.99'))).toBe('90000000000000.99');
  });

  it('форматирование для показа', () => {
    const nbsp = (s: string) => s.replace(/[  ]/g, ' ');
    expect(nbsp(formatMoney('-1234.5'))).toBe('−1 234,50 ₽');
    expect(nbsp(formatMoney('1000.00', 'USD', { signed: true }))).toBe('+1 000 $');
    expect(formatMoney(null)).toBe('—');
  });
});
