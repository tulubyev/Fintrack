/**
 * Суммы из выписок → строка «-1234.50» (D11), без float.
 * Переносит: разделители тысяч (пробел, NBSP U+00A0, узкий NBSP U+202F, апостроф), запятую или точку как десятичный
 * разделитель, минус «-» или «−» (U+2212), «+» у пополнений, скобки «(100,00)», суффиксы ₽, RUB, руб., р.
 */
export function parseAmount(input: string | number | null | undefined, decimal?: ',' | '.'): string | null {
  if (input === null || input === undefined) return null;
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) return null;
    return normalizeDigits(input.toFixed(2));
  }
  let value = input.trim();
  if (!value) return null;
  let negative = false;
  if (/^\(.*\)$/.test(value)) {
    negative = true;
    value = value.slice(1, -1);
  }
  value = value
    .replace(/[   \s']/g, '')
    .replace(/(₽|rub|руб\.?|р\.|usd|eur|cny|\$|€|¥)$/i, '')
    .replace(/^(₽|rub|руб\.?|usd|eur|\$|€)/i, '');
  if (/^[-−–]/.test(value)) {
    negative = !negative;
    value = value.slice(1);
  } else if (value.startsWith('+')) {
    value = value.slice(1);
  }
  if (/[-−–]$/.test(value)) {
    // «1234,50-» — так пишут списания некоторые банки
    negative = !negative;
    value = value.slice(0, -1);
  }
  const separator = decimal ?? guessDecimal(value);
  const [whole, fraction, ...rest] = separator === ',' ? value.replace(/\./g, '').split(',') : value.replace(/,/g, '').split('.');
  if (rest.length || !/^\d+$/.test(whole) || (fraction !== undefined && !/^\d{0,2}$/.test(fraction))) return null;
  const result = `${whole.replace(/^0+(?=\d)/, '')}.${(fraction ?? '').padEnd(2, '0')}`;
  return negative && /[1-9]/.test(result) ? `-${result}` : result;
}

/** Десятичный разделитель — последний из «,» и «.», если после него 1–2 цифры; иначе это разделитель тысяч. */
function guessDecimal(value: string): ',' | '.' {
  const comma = value.lastIndexOf(',');
  const dot = value.lastIndexOf('.');
  if (comma === -1 && dot === -1) return ',';
  const last = Math.max(comma, dot);
  const digitsAfter = value.length - last - 1;
  if (comma !== -1 && dot !== -1) return comma > dot ? ',' : '.';
  // «1,234» или «1.234» без второго разделителя: три цифры после — это тысячи
  if (digitsAfter === 3) return comma !== -1 ? '.' : ',';
  return comma !== -1 ? ',' : '.';
}

function normalizeDigits(value: string): string {
  return value === '-0.00' ? '0.00' : value;
}

/** «-1234.50» → -123450n. */
export function toKopecks(amount: string): bigint {
  const negative = amount.startsWith('-');
  const [whole, fraction = ''] = amount.replace('-', '').split('.');
  const kopecks = BigInt(whole || '0') * 100n + BigInt((fraction + '00').slice(0, 2));
  return negative ? -kopecks : kopecks;
}

export function fromKopecks(kopecks: bigint): string {
  const negative = kopecks < 0n;
  const abs = negative ? -kopecks : kopecks;
  return `${negative ? '-' : ''}${abs / 100n}.${(abs % 100n).toString().padStart(2, '0')}`;
}

export function negate(amount: string): string {
  return fromKopecks(-toKopecks(amount));
}

/** Валюта по коду или символу: «RUB», «RUR», «₽», «руб.» → RUB. null — не распознана. */
export function parseCurrency(input: string | null | undefined): string | null {
  if (!input) return null;
  const value = input.trim().toUpperCase().replace(/\.$/, '');
  if (!value) return null;
  const aliases: Record<string, string> = { RUR: 'RUB', '₽': 'RUB', 'РУБ': 'RUB', 'Р': 'RUB', '$': 'USD', '€': 'EUR', '¥': 'CNY', 'ДОЛЛ': 'USD', 'ЕВРО': 'EUR', 'ЮАНЬ': 'CNY' };
  if (aliases[value]) return aliases[value];
  return /^[A-Z]{3}$/.test(value) ? value : null;
}
