/**
 * Ввод суммы с цифровой клавиатуры быстрого ввода (E2.1-T7): строка вида «1234,5». Не больше двух знаков после запятой
 * и 10 цифр в целой части, без ведущих нулей. toApiAmount — в формат API: «1234.50».
 */
export type AmountKey = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "," | "back";

const MAX_WHOLE = 10;

export function applyAmountKey(value: string, key: AmountKey): string {
  if (key === "back") return value.slice(0, -1);
  const [whole, fraction] = value.split(",");
  if (key === ",") return value.includes(",") ? value : `${whole || "0"},`;
  if (fraction !== undefined) return fraction.length >= 2 ? value : `${value}${key}`;
  if (whole === "0") return key;
  return whole.length >= MAX_WHOLE ? value : `${value}${key}`;
}

/** «1234,5» → «1234.50»; пусто или ноль — null. */
export function toApiAmount(value: string): string | null {
  if (!value) return null;
  const [whole, fraction = ""] = value.split(",");
  const amount = `${Number(whole || "0")}.${fraction.padEnd(2, "0")}`;
  return amount === "0.00" ? null : amount;
}

/** Для показа: «1234,5» → «1 234,5». */
export function displayAmount(value: string): string {
  const [whole, fraction] = value.split(",");
  const grouped = (whole || "0").replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return fraction === undefined ? grouped : `${grouped},${fraction}`;
}

/** «150.00» → «150»; «150.50» → «150,5»: сумма операции — в строку клавиатуры при правке. */
export function fromApiAmount(amount: string): string {
  const [whole, fraction = ""] = amount.replace("-", "").split(".");
  const trimmed = fraction.replace(/0+$/, "");
  return trimmed ? `${whole},${trimmed}` : whole;
}
