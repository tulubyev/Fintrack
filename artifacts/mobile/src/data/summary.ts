import { fromKopecks, toKopecks } from "@workspace/shared/money";
import type { Category, Series, Transaction } from "./types";

/**
 * Сводка главной (E2.1-T7) по локальной базе — та же логика, что у сайта (services/dashboardService.ts):
 * - траты = −Σ amountRub расходов; возврат (поступление в категории расходов) уменьшает траты, а не прибавляется к доходам;
 * - переводы, корректировки, исключённые из статистики и неподтверждённые операции не считаются;
 * - месяц сравнивается с тем же периодом прошлого: 1–17 октября против 1–17 сентября;
 * - топ — по родительским категориям расходов, до 5 строк и «Остальное».
 */

export const TOP_CATEGORIES = 5;
export const UPCOMING_DAYS = 14;

type Tx = Pick<Transaction, "type" | "categoryId" | "date" | "excludeFromStats"> & { amountRub?: string | null; status?: string };

export interface CategoryShare {
  categoryId: string | null;
  name: string;
  amount: string;
  /** Доля от всех трат месяца, 0…1. */
  share: number;
  /** Изменение к тому же периоду прошлого месяца, %; null — сравнивать не с чем. */
  deltaPct: number | null;
}

export interface MonthSummary {
  month: string;
  from: string;
  to: string;
  income: string;
  expense: string;
  net: string;
  expensePrevSamePeriod: string;
  expenseDeltaPct: number | null;
  top: CategoryShare[];
  other: { amount: string; share: number } | null;
  uncategorized: number;
}

export interface Upcoming {
  seriesId: string;
  name: string;
  amount: string;
  currency: string;
  date: string;
}

const daysInMonth = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};
export const shiftMonth = (month: string, delta: number) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
};
const day = (month: string, n: number) => `${month}-${String(n).padStart(2, "0")}`;
export const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

function deltaPct(current: bigint, previous: bigint): number | null {
  if (previous <= 0n) return null;
  return Math.round(Number(((current - previous) * 1000n) / previous)) / 10;
}

const counted = (tx: Tx) =>
  (tx.type === "income" || tx.type === "expense") && !tx.excludeFromStats && (tx.status ?? "posted") === "posted" && tx.amountRub != null;

export function monthSummary(transactions: Tx[], categories: Category[], today: string): MonthSummary {
  const month = today.slice(0, 7);
  const passed = Number(today.slice(8, 10));
  const prevMonth = shiftMonth(month, -1);
  const from = day(month, 1);
  const prevFrom = day(prevMonth, 1);
  const prevTo = day(prevMonth, Math.min(passed, daysInMonth(prevMonth)));

  const byId = new Map(categories.map((category) => [category.id, category]));
  const parentOf = (id: string) => {
    const category = byId.get(id);
    return category?.parentId && byId.has(category.parentId) ? category.parentId : id;
  };
  const isExpenseCategory = (id: string | null) => id === null || byId.get(parentOf(id))?.kind === "expense";

  const totals = (list: Tx[]) => {
    let income = 0n;
    let expense = 0n;
    const byParent = new Map<string | null, bigint>();
    for (const tx of list) {
      const amount = toKopecks(tx.amountRub!);
      const refund = tx.type === "income" && tx.categoryId !== null && byId.get(parentOf(tx.categoryId))?.kind === "expense";
      if (tx.type === "income" && !refund) income += amount;
      else expense -= amount;
      // траты по категориям: доход без категории — не возврат
      if (tx.type === "income" && tx.categoryId === null) continue;
      if (!isExpenseCategory(tx.categoryId)) continue;
      const key = tx.categoryId === null ? null : parentOf(tx.categoryId);
      byParent.set(key, (byParent.get(key) ?? 0n) - amount);
    }
    return { income, expense, byParent };
  };

  const current = transactions.filter((tx) => counted(tx) && tx.date >= from && tx.date <= today);
  const previous = transactions.filter((tx) => counted(tx) && tx.date >= prevFrom && tx.date <= prevTo);
  const now = totals(current);
  const prev = totals(previous);

  const total = [...now.byParent.values()].reduce((sum, value) => sum + (value > 0n ? value : 0n), 0n);
  const share = (value: bigint) => (total > 0n ? Math.round(Number((value * 1000n) / total)) / 1000 : 0);
  const ranked = [...now.byParent].filter(([, value]) => value > 0n).sort((a, b) => (b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : 0));
  const top = ranked.slice(0, TOP_CATEGORIES).map(([id, value]) => ({
    categoryId: id,
    name: id ? byId.get(id)?.name ?? "Категория" : "Без категории",
    amount: fromKopecks(value),
    share: share(value),
    deltaPct: deltaPct(value, prev.byParent.get(id) ?? 0n),
  }));
  const rest = ranked.slice(TOP_CATEGORIES).reduce((sum, [, value]) => sum + value, 0n);

  return {
    month,
    from,
    to: today,
    income: fromKopecks(now.income),
    expense: fromKopecks(now.expense),
    net: fromKopecks(now.income - now.expense),
    expensePrevSamePeriod: fromKopecks(prev.expense),
    expenseDeltaPct: deltaPct(now.expense, prev.expense),
    top,
    other: rest > 0n ? { amount: fromKopecks(rest), share: share(rest) } : null,
    uncategorized: transactions.filter((tx) => (tx.type === "income" || tx.type === "expense") && tx.categoryId === null).length,
  };
}

const addMonths = (date: string, months: number) => {
  const [y, m, d] = date.split("-").map(Number);
  const last = new Date(Date.UTC(y, m - 1 + months + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1 + months, Math.min(d, last))).toISOString().slice(0, 10);
};

function step(date: string, periodicity: string | null): string | null {
  switch (periodicity) {
    case "weekly": return addDays(date, 7);
    case "biweekly": return addDays(date, 14);
    case "monthly": return addMonths(date, 1);
    case "quarterly": return addMonths(date, 3);
    case "yearly": return addMonths(date, 12);
    default: return null;
  }
}

/**
 * Ближайшие списания за 14 дней, как на сайте (recurringApi.upcoming): серии detected и confirmed с ожидаемой суммой;
 * прошедшая дата сдвигается шагом периодичности, еженедельная даёт несколько списаний.
 */
export function upcomingPayments(series: Series[], today: string, days = UPCOMING_DAYS): Upcoming[] {
  const until = addDays(today, days);
  const items: Upcoming[] = [];
  for (const row of series) {
    if (row.direction !== "out" || (row.status !== "detected" && row.status !== "confirmed")) continue;
    if (!row.nextExpectedDate || !row.expectedAmount) continue;
    let date: string | null = row.nextExpectedDate;
    for (let i = 0; date && date <= until && i < 60; i++) {
      if (date >= today) items.push({ seriesId: row.id, name: row.displayName, amount: row.expectedAmount, currency: row.currency, date });
      date = step(date, row.periodicity);
    }
  }
  return items.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name, "ru"));
}

/** Частые категории для быстрого ввода: чаще всего выбранные за 90 дней для этого типа операций. */
export function frequentCategories(transactions: Pick<Transaction, "type" | "categoryId" | "date">[], type: "expense" | "income", today: string, limit = 6): string[] {
  const since = addDays(today, -90);
  const counts = new Map<string, number>();
  for (const tx of transactions) {
    if (tx.type !== type || !tx.categoryId || tx.date < since) continue;
    counts.set(tx.categoryId, (counts.get(tx.categoryId) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([id]) => id);
}
