import { fromKopecks, toKopecks } from "@workspace/shared/money";
import type { Budget, Category, Transaction } from "./types";

/**
 * Бюджеты месяца (E2.1-T8) по локальной базе — та же логика, что у сайта (services/budgetService.ts, listBudgets):
 * - траты = −Σ amountRub расходов и поступлений с категорией (возвраты уменьшают траты); переводы, исключённые из
 *   статистики и неподтверждённые не считаются;
 * - бюджет категории считает её подкатегории; общий — все расходы и без категории, кроме исключённых категорий;
 * - перенос остатка: лимит + max(0, лимит прошлого месяца − траты прошлого), не дальше 12 месяцев назад;
 * - статус: over — траты больше лимита; warning — больше ожидаемого к сегодня или ≥ 80 % лимита; иначе ok;
 * - бюджет подкатегории показывается внутри бюджета родителя, если он есть.
 */

export const ROLLOVER_DEPTH = 12;

export type BudgetState = "ok" | "warning" | "over";

export interface BudgetStatus {
  id: string;
  categoryId: string | null;
  name: string;
  amount: string;
  effectiveAmount: string;
  spent: string;
  remaining: string;
  percent: number;
  expectedByToday: string;
  status: BudgetState;
  rollover: boolean;
  children?: BudgetStatus[];
}

export interface MonthBudgets {
  month: string;
  items: BudgetStatus[];
  total: { amount: string; spent: string; remaining: string };
  unbudgetedSpent: string;
}

type BudgetRow = Pick<Budget, "id" | "categoryId" | "amount" | "effectiveFrom" | "effectiveTo"> & {
  rollover?: boolean;
  excludedCategoryIds?: string[];
};
type Tx = Pick<Transaction, "type" | "categoryId" | "date" | "excludeFromStats" | "amountRub"> & { status?: string };

export const shiftMonth = (month: string, delta: number) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
};
const daysInMonth = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};
const monthStart = (month: string) => `${month}-01`;
const activeAt = (month: string) => (budget: BudgetRow) =>
  budget.effectiveFrom <= monthStart(month) && (!budget.effectiveTo || budget.effectiveTo >= monthStart(month));

/** Самая ранняя дата операций, нужная для месяца: перенос остатка смотрит до года назад. */
export const budgetsFromDate = (month: string) => monthStart(shiftMonth(month, -ROLLOVER_DEPTH));

export function monthBudgets(budgets: BudgetRow[], transactions: Tx[], categories: Category[], month: string, today: string): MonthBudgets {
  const byId = new Map(categories.map((category) => [category.id, category]));
  const subtree = new Map<string, string[]>();
  for (const category of categories) {
    if (!subtree.has(category.id)) subtree.set(category.id, [category.id]);
    if (category.parentId) {
      const list = subtree.get(category.parentId) ?? [category.parentId];
      list.push(category.id);
      subtree.set(category.parentId, list);
    }
  }

  // траты по месяцам и категориям, копейки
  const spending = new Map<string, Map<string | null, bigint>>();
  for (const tx of transactions) {
    if (tx.excludeFromStats || (tx.status ?? "posted") !== "posted" || tx.amountRub == null) continue;
    if (!(tx.type === "expense" || (tx.type === "income" && tx.categoryId !== null))) continue;
    const key = tx.date.slice(0, 7);
    const months = spending.get(key) ?? new Map<string | null, bigint>();
    months.set(tx.categoryId, (months.get(tx.categoryId) ?? 0n) - toKopecks(tx.amountRub));
    spending.set(key, months);
  }

  const spentFor = (budget: BudgetRow, monthKey: string): bigint => {
    const monthSpending = spending.get(monthKey);
    if (!monthSpending) return 0n;
    let total = 0n;
    if (budget.categoryId) {
      for (const id of subtree.get(budget.categoryId) ?? [budget.categoryId]) total += monthSpending.get(id) ?? 0n;
      return total;
    }
    const excluded = new Set((budget.excludedCategoryIds ?? []).flatMap((id) => subtree.get(id) ?? [id]));
    for (const [categoryId, spent] of monthSpending) {
      if (categoryId === null) total += spent;
      else if (byId.get(categoryId)?.kind === "expense" && !excluded.has(categoryId)) total += spent;
    }
    return total;
  };

  const effectiveAmount = (budget: BudgetRow, monthKey: string, depth = 0): bigint => {
    const base = toKopecks(budget.amount);
    if (!budget.rollover || depth >= ROLLOVER_DEPTH) return base;
    const prevMonth = shiftMonth(monthKey, -1);
    const prev = budgets.find((version) => version.categoryId === budget.categoryId && activeAt(prevMonth)(version));
    if (!prev) return base;
    const left = effectiveAmount(prev, prevMonth, depth + 1) - spentFor(prev, prevMonth);
    return base + (left > 0n ? left : 0n);
  };

  const expectedByToday = (limit: bigint) => {
    const current = today.slice(0, 7);
    if (month < current) return limit;
    if (month > current) return 0n;
    return (limit * BigInt(Number(today.slice(8, 10)))) / BigInt(daysInMonth(month));
  };

  const toStatus = (budget: BudgetRow): BudgetStatus => {
    const limit = effectiveAmount(budget, month);
    const spent = spentFor(budget, month);
    const expected = expectedByToday(limit);
    const status: BudgetState = spent > limit ? "over" : spent > expected || spent * 100n >= limit * 80n ? "warning" : "ok";
    return {
      id: budget.id,
      categoryId: budget.categoryId,
      name: budget.categoryId ? byId.get(budget.categoryId)?.name ?? "Категория" : "Общий бюджет",
      amount: budget.amount,
      effectiveAmount: fromKopecks(limit),
      spent: fromKopecks(spent),
      remaining: fromKopecks(limit - spent),
      percent: limit > 0n ? Number((spent * 100n) / limit) : 0,
      expectedByToday: fromKopecks(expected),
      status,
      rollover: Boolean(budget.rollover),
    };
  };

  const byPercent = (a: BudgetStatus, b: BudgetStatus) => b.percent - a.percent || a.id.localeCompare(b.id);
  const active = budgets.filter(activeAt(month));
  const statuses = new Map(active.map((budget) => [budget.id, toStatus(budget)]));
  const byCategory = new Map(active.filter((budget) => budget.categoryId).map((budget) => [budget.categoryId!, budget]));
  const items: BudgetStatus[] = [];
  for (const budget of active) {
    const status = statuses.get(budget.id)!;
    const parentId = budget.categoryId ? byId.get(budget.categoryId)?.parentId : null;
    const parentBudget = parentId ? byCategory.get(parentId) : undefined;
    if (parentBudget) (statuses.get(parentBudget.id)!.children ??= []).push(status);
    else items.push(status);
  }
  for (const item of items) item.children?.sort(byPercent);
  items.sort((a, b) => (a.categoryId === null ? -1 : b.categoryId === null ? 1 : byPercent(a, b)));

  const totalBudget = items.find((item) => item.categoryId === null);
  const top = totalBudget ? [totalBudget] : items;
  const amount = top.reduce((sum, item) => sum + toKopecks(item.effectiveAmount), 0n);
  const spent = top.reduce((sum, item) => sum + toKopecks(item.spent), 0n);

  const covered = new Set(active.filter((budget) => budget.categoryId).flatMap((budget) => subtree.get(budget.categoryId!) ?? []));
  let unbudgeted = 0n;
  for (const [categoryId, value] of spending.get(month) ?? []) {
    if (categoryId === null) unbudgeted += value;
    else if (byId.get(categoryId)?.kind === "expense" && !covered.has(categoryId)) unbudgeted += value;
  }

  return {
    month,
    items,
    total: { amount: fromKopecks(amount), spent: fromKopecks(spent), remaining: fromKopecks(amount - spent) },
    unbudgetedSpent: fromKopecks(unbudgeted),
  };
}
