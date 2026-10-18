/**
 * Деньги (решение D11): в БД numeric(15,2), в API — строка "1234.50", в коде — копейки в bigint.
 * parseFloat для сумм не используем: двоичная дробь теряет копейки.
 */
const MONEY_RE = /^(-)?(\d{1,13})(?:\.(\d{1,2}))?$/;

/** "1234.5" → 123450n. Бросает ошибку на нечисловой строке. */
export function toKopecks(value: string | number): bigint {
  const text = typeof value === "number" ? value.toFixed(2) : value.trim();
  const match = MONEY_RE.exec(text);
  if (!match) throw new Error(`Некорректная сумма: ${value}`);
  const [, minus, rubles, fraction = ""] = match;
  const kopecks = BigInt(rubles) * 100n + BigInt(fraction.padEnd(2, "0"));
  return minus ? -kopecks : kopecks;
}

/** 123450n → "1234.50" */
export function fromKopecks(kopecks: bigint): string {
  const sign = kopecks < 0n ? "-" : "";
  const abs = kopecks < 0n ? -kopecks : kopecks;
  return `${sign}${abs / 100n}.${String(abs % 100n).padStart(2, "0")}`;
}

/** Строка суммы в каноническом виде с двумя знаками: "-12.5" → "-12.50" */
export const normalizeMoney = (value: string): string => fromKopecks(toKopecks(value));

export const isMoney = (value: string): boolean => MONEY_RE.test(value.trim());

/** Пересчёт по курсу (строка numeric(18,6), рублей за единицу) с округлением до копейки половиной вверх. */
export function convertByRate(kopecks: bigint, rate: string): bigint {
  const [whole, fraction = ""] = rate.trim().split(".");
  const micro = BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0").slice(0, 6));
  const scaled = kopecks * micro;
  const half = scaled < 0n ? -500_000n : 500_000n;
  return (scaled + half) / 1_000_000n;
}
