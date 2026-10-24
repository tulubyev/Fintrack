import { formatDate, todayIso } from "@workspace/shared/money";

/** Даты приложения — по московскому календарю, как в API (YYYY-MM-DD). */
export const shiftDate = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
export const yesterdayIso = () => shiftDate(todayIso(), -1);

/** Заголовок дня в ленте: «Сегодня», «Вчера» или дата. */
export function dayTitle(date: string, today = todayIso()): string {
  if (date === today) return "Сегодня";
  if (date === shiftDate(today, -1)) return "Вчера";
  return formatDate(date);
}

export type Period = "month" | "prev" | "3m" | "all";

/** Границы периода, как в ленте сайта (TransactionsPage): этот месяц, прошлый, 3 месяца, всё время. */
export function periodRange(period: Period, today = todayIso()): { from?: string; to?: string } {
  const [y, m] = today.split("-").map(Number);
  const iso = (year: number, month: number, day: number) => new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
  switch (period) {
    case "month": return { from: iso(y, m, 1), to: iso(y, m + 1, 0) };
    case "prev": return { from: iso(y, m - 1, 1), to: iso(y, m, 0) };
    case "3m": return { from: iso(y, m - 2, 1), to: iso(y, m + 1, 0) };
    default: return {};
  }
}
