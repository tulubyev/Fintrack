/**
 * Деньги в вебе (решение D11): API отдаёт и принимает суммы строками «1234.50».
 * Арифметики над суммами в браузере нет — только разбор ввода и форматирование для показа.
 */

const CURRENCY_SYMBOLS: Record<string, string> = { RUB: '₽', USD: '$', EUR: '€', CNY: '¥', GBP: '£', KZT: '₸', BYN: 'Br', TRY: '₺', AED: 'AED' };

export const currencySymbol = (currency: string) => CURRENCY_SYMBOLS[currency] ?? currency;

/** «-1234.5» → «−1 234,50 ₽». Number здесь только для показа: до 90 трлн точность копеек сохраняется. */
export function formatMoney(amount: string | null | undefined, currency = 'RUB', options: { signed?: boolean; fraction?: 'auto' | 'always' } = {}): string {
  if (amount === null || amount === undefined || amount === '') return '—';
  const value = Number(amount);
  const hasKopecks = /\.\d*[1-9]/.test(amount); // «1234.50» — с копейками, «1234.00» — без
  const digits = options.fraction === 'always' || hasKopecks ? 2 : 0;
  const formatted = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(Math.abs(value));
  const sign = value < 0 ? '−' : options.signed && value > 0 ? '+' : '';
  return `${sign}${formatted} ${currencySymbol(currency)}`;
}

/**
 * Ввод пользователя → строка API: «1 234,5» → «1234.50», «-500» → «-500.00».
 * null — если это не сумма (буквы, больше двух знаков после запятой).
 */
export function parseMoneyInput(input: string, { allowNegative = true } = {}): string | null {
  const cleaned = input.replace(/[\s ₽$€]/g, '').replace(',', '.').replace(/^−/, '-');
  if (!/^-?\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  if (!allowNegative && cleaned.startsWith('-')) return null;
  const [whole, fraction = ''] = cleaned.split('.');
  const normalizedWhole = whole.replace(/^(-?)0+(?=\d)/, '$1');
  return `${normalizedWhole}.${fraction.padEnd(2, '0')}`;
}

/** Сегодня в Москве в формате YYYY-MM-DD (даты операций в API — по МСК). */
export function todayIso(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' }).format(new Date());
}

/** «2026-10-18» → «18 октября» (год — если не текущий). */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const sameYear = y === Number(todayIso().slice(0, 4));
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', ...(sameYear ? {} : { year: 'numeric' }), timeZone: 'UTC' }).format(date);
}
