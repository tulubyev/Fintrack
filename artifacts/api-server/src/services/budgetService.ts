/**
 * Бюджеты v2 (E1.4-T1/T2): версии по месяцам, исполнение по поддереву категории с учётом возвратов,
 * перенос остатка, статус по темпу, общий бюджет и предложения по медиане трат за 3 месяца.
 * Деньги считаются в копейках (bigint), даты — календарные месяцы по local_date (МСК).
 */
import { randomUUID } from "node:crypto";
import { and, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import { budgets, transactions, type Budget } from "@shared/schema";
import { db } from "../db";
import { ApiError } from "../lib/apiError";
import { fromKopecks, toKopecks } from "../lib/money";
import { listCategoryTree, type CategoryNode } from "./categoryService";

type Executor = Parameters<Parameters<typeof db.transaction>[0]>[0] | typeof db;

const ROLLOVER_DEPTH = 12; // перенос остатка смотрит не дальше года назад
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

// ---------- месяцы ----------

export const isMonth = (value: string) => MONTH_RE.test(value);
export const todayMsk = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow" }).format(new Date());
export const currentMonth = () => todayMsk().slice(0, 7);
const monthStart = (month: string) => `${month}-01`;
function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
}
const daysInMonth = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};
/** Последний день месяца перед month: так закрывается версия бюджета. */
const lastDayBefore = (month: string) => {
  const prev = shiftMonth(month, -1);
  return `${prev}-${String(daysInMonth(prev)).padStart(2, "0")}`;
};

// ---------- категории ----------

interface CategoryInfo {
  node: CategoryNode;
  parentId: string | null;
  /** сама категория и её подкатегории */
  subtree: string[];
}

async function categoryIndex(userId: string): Promise<Map<string, CategoryInfo>> {
  const tree = await listCategoryTree(userId, { includeHidden: true });
  const index = new Map<string, CategoryInfo>();
  for (const parent of tree) {
    index.set(parent.id, { node: parent, parentId: null, subtree: [parent.id, ...parent.children.map((child) => child.id)] });
    for (const child of parent.children) index.set(child.id, { node: child, parentId: parent.id, subtree: [child.id] });
  }
  return index;
}

/** Бюджет — только на свою или системную категорию расходов; чужая неотличима от несуществующей. */
function assertExpenseCategory(index: Map<string, CategoryInfo>, categoryId: string) {
  const info = index.get(categoryId);
  if (!info) throw new ApiError(404, "NOT_FOUND", "Категория не найдена");
  if (info.node.kind !== "expense") throw new ApiError(400, "VALIDATION_ERROR", "Бюджет задаётся только для категории расходов");
}

// ---------- траты ----------

/**
 * Траты по категориям и месяцам (или дням — для графика): spent = −Σ amount_rub (возвраты уменьшают траты);
 * null — без категории.
 */
async function spendingByMonth(executor: Executor, userId: string, fromMonth: string, toMonth: string, by: "month" | "day" = "month") {
  const period = by === "month" ? "YYYY-MM" : "YYYY-MM-DD";
  const { rows } = await executor.execute<{ category_id: string | null; month: string; spent: string }>(sql`
    SELECT ${transactions.categoryId} AS category_id, to_char(${transactions.localDate}, ${period}) AS month,
           (-sum(${transactions.amountRub}))::text AS spent
    FROM ${transactions}
    WHERE ${transactions.userId} = ${userId}
      AND ${transactions.deletedAt} IS NULL AND ${transactions.status} = 'posted' AND ${transactions.excludeFromStats} = false
      AND ${transactions.amountRub} IS NOT NULL
      AND ${transactions.localDate} >= ${monthStart(fromMonth)}::date AND ${transactions.localDate} < ${monthStart(shiftMonth(toMonth, 1))}::date
      AND (${transactions.type} = 'expense' OR (${transactions.type} = 'income' AND ${transactions.categoryId} IS NOT NULL))
    GROUP BY 1, 2
  `);
  const byMonth = new Map<string, Map<string | null, bigint>>();
  for (const row of rows) {
    if (!byMonth.has(row.month)) byMonth.set(row.month, new Map());
    byMonth.get(row.month)!.set(row.category_id, toKopecks(row.spent));
  }
  return byMonth;
}

function spentFor(budget: Budget, monthSpending: Map<string | null, bigint> | undefined, index: Map<string, CategoryInfo>): bigint {
  if (!monthSpending) return 0n;
  let total = 0n;
  if (budget.categoryId) {
    for (const id of index.get(budget.categoryId)?.subtree ?? [budget.categoryId]) total += monthSpending.get(id) ?? 0n;
    return total;
  }
  // общий бюджет: все расходы (и без категории), кроме исключённых категорий с подкатегориями
  const excluded = new Set(budget.excludedCategoryIds.flatMap((id) => index.get(id)?.subtree ?? [id]));
  for (const [categoryId, spent] of monthSpending) {
    if (categoryId === null) { total += spent; continue; }
    const info = index.get(categoryId);
    if (info?.node.kind === "expense" && !excluded.has(categoryId)) total += spent;
  }
  return total;
}

// ---------- версии ----------

const activeAt = (month: string) => (budget: Budget) =>
  !budget.deletedAt && budget.effectiveFrom <= monthStart(month) && (!budget.effectiveTo || budget.effectiveTo >= monthStart(month));

const sameTarget = (a: { categoryId: string | null }, b: { categoryId: string | null }) => a.categoryId === b.categoryId;

async function loadVersions(executor: Executor, userId: string, fromMonth: string, toMonth: string): Promise<Budget[]> {
  return executor.select().from(budgets).where(and(
    eq(budgets.userId, userId),
    isNull(budgets.deletedAt),
    lte(budgets.effectiveFrom, monthStart(toMonth)),
    or(isNull(budgets.effectiveTo), gte(budgets.effectiveTo, monthStart(fromMonth))),
  ));
}

// ---------- статус ----------

export type BudgetState = "ok" | "warning" | "over";

export interface BudgetStatus {
  id: string;
  categoryId: string | null;
  category: { name: string; icon: string | null; color: string | null } | null;
  amount: string;
  effectiveAmount: string;
  spent: string;
  remaining: string;
  percent: number;
  expectedByToday: string;
  status: BudgetState;
  rollover: boolean;
  effectiveFrom: string;
  effectiveTo: string | null;
  excludedCategoryIds: string[];
  alertThresholds: number[];
  children?: BudgetStatus[];
}

interface Context {
  month: string;
  versions: Budget[];
  spending: Map<string, Map<string | null, bigint>>;
  index: Map<string, CategoryInfo>;
}

/** Лимит месяца с переносом: amount + max(0, лимит прошлого месяца − траты прошлого месяца). */
function effectiveAmount(ctx: Context, budget: Budget, month: string, depth = 0): bigint {
  const base = toKopecks(budget.amount);
  if (!budget.rollover || depth >= ROLLOVER_DEPTH) return base;
  const prevMonth = shiftMonth(month, -1);
  const prev = ctx.versions.find((version) => sameTarget(version, budget) && activeAt(prevMonth)(version));
  if (!prev) return base;
  const prevLimit = effectiveAmount(ctx, prev, prevMonth, depth + 1);
  const prevSpent = spentFor(prev, ctx.spending.get(prevMonth), ctx.index);
  const left = prevLimit - prevSpent;
  return base + (left > 0n ? left : 0n);
}

function expectedByToday(limit: bigint, month: string): bigint {
  const current = currentMonth();
  if (month < current) return limit;
  if (month > current) return 0n;
  const day = Number(todayMsk().slice(8, 10));
  return (limit * BigInt(day)) / BigInt(daysInMonth(month));
}

function toStatus(ctx: Context, budget: Budget): BudgetStatus {
  const limit = effectiveAmount(ctx, budget, ctx.month);
  const spent = spentFor(budget, ctx.spending.get(ctx.month), ctx.index);
  const expected = expectedByToday(limit, ctx.month);
  const status: BudgetState = spent > limit ? "over"
    : spent > expected || spent * 100n >= limit * 80n ? "warning"
    : "ok";
  const node = budget.categoryId ? ctx.index.get(budget.categoryId)?.node : undefined;
  return {
    id: budget.id,
    categoryId: budget.categoryId,
    category: node ? { name: node.name, icon: node.icon, color: node.color } : null,
    amount: budget.amount,
    effectiveAmount: fromKopecks(limit),
    spent: fromKopecks(spent),
    remaining: fromKopecks(limit - spent),
    percent: limit > 0n ? Number((spent * 100n) / limit) : 0,
    expectedByToday: fromKopecks(expected),
    status,
    rollover: budget.rollover,
    effectiveFrom: budget.effectiveFrom,
    effectiveTo: budget.effectiveTo,
    excludedCategoryIds: budget.excludedCategoryIds,
    alertThresholds: budget.alertThresholds,
  };
}

async function context(executor: Executor, userId: string, month: string, index?: Map<string, CategoryInfo>): Promise<Context> {
  const from = shiftMonth(month, -ROLLOVER_DEPTH);
  const [versions, spending, categories] = await Promise.all([
    loadVersions(executor, userId, from, month),
    spendingByMonth(executor, userId, from, month),
    index ? Promise.resolve(index) : categoryIndex(userId),
  ]);
  return { month, versions, spending, index: categories };
}

const byPercent = (a: BudgetStatus, b: BudgetStatus) => b.percent - a.percent || a.id.localeCompare(b.id);

export async function listBudgets(userId: string, month = currentMonth()) {
  const ctx = await context(db, userId, month);
  const active = ctx.versions.filter(activeAt(month));
  const statuses = new Map(active.map((budget) => [budget.id, toStatus(ctx, budget)]));

  // подкатегория с бюджетом показывается внутри бюджета родителя, если он есть
  const byCategory = new Map(active.filter((b) => b.categoryId).map((b) => [b.categoryId!, b]));
  const items: BudgetStatus[] = [];
  for (const budget of active) {
    const status = statuses.get(budget.id)!;
    const parentId = budget.categoryId ? ctx.index.get(budget.categoryId)?.parentId : null;
    const parentBudget = parentId ? byCategory.get(parentId) : undefined;
    if (parentBudget) {
      const parent = statuses.get(parentBudget.id)!;
      (parent.children ??= []).push(status);
    } else {
      items.push(status);
    }
  }
  for (const item of items) item.children?.sort(byPercent);
  items.sort((a, b) => (a.categoryId === null ? -1 : b.categoryId === null ? 1 : byPercent(a, b)));

  // итог: общий бюджет, если есть, иначе сумма бюджетов верхнего уровня
  const totalBudget = items.find((item) => item.categoryId === null);
  const top = totalBudget ? [totalBudget] : items;
  const amount = top.reduce((sum, item) => sum + toKopecks(item.effectiveAmount), 0n);
  const spent = top.reduce((sum, item) => sum + toKopecks(item.spent), 0n);

  // «без бюджета»: расходы вне поддеревьев категорийных бюджетов, включая операции без категории
  const covered = new Set(active.filter((b) => b.categoryId).flatMap((b) => ctx.index.get(b.categoryId!)?.subtree ?? []));
  let unbudgeted = 0n;
  for (const [categoryId, value] of ctx.spending.get(month) ?? []) {
    if (categoryId === null) { unbudgeted += value; continue; }
    if (ctx.index.get(categoryId)?.node.kind === "expense" && !covered.has(categoryId)) unbudgeted += value;
  }

  return {
    month,
    items,
    total: { amount: fromKopecks(amount), spent: fromKopecks(spent), remaining: fromKopecks(amount - spent) },
    unbudgetedSpent: fromKopecks(unbudgeted),
  };
}

/** Траты бюджета по дням месяца для графика: за прошедшие дни, с нарастающим итогом. */
export async function budgetDaily(userId: string, id: string, month = currentMonth()) {
  const budget = await getOwnBudget(db, userId, id);
  const ctx = await context(db, userId, month);
  // клиент может прислать id прошлой версии: берём версию той же категории, действующую в этом месяце
  const version = ctx.versions.find((item) => sameTarget(item, budget) && activeAt(month)(item));
  if (!version) throw new ApiError(404, "NOT_FOUND", "Бюджет не действует в этом месяце");
  const byDay = await spendingByMonth(db, userId, month, month, "day");
  const today = todayMsk();
  const last = month < today.slice(0, 7) ? daysInMonth(month) : month === today.slice(0, 7) ? Number(today.slice(8, 10)) : 0;
  let cumulative = 0n;
  const days = Array.from({ length: last }, (_, i) => {
    const date = `${month}-${String(i + 1).padStart(2, "0")}`;
    const spent = spentFor(version, byDay.get(date), ctx.index);
    cumulative += spent;
    return { date, spent: fromKopecks(spent), cumulative: fromKopecks(cumulative) };
  });
  return { month, budgetId: version.id, amount: fromKopecks(effectiveAmount(ctx, version, month)), daysInMonth: daysInMonth(month), days };
}

// ---------- изменения ----------

export interface BudgetInput {
  id?: string;
  categoryId: string | null;
  amount: string;
  rollover?: boolean;
  fromMonth?: string;
  excludedCategoryIds?: string[];
  alertThresholds?: number[];
}

/** Одна блокировка на пользователя: проверка пересечений и запись версий идут без гонок. */
const lockUser = (tx: Executor, userId: string) => tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`budgets:${userId}`}))`);

function overlaps(versions: Budget[], categoryId: string | null, fromMonth: string, exceptId?: string) {
  return versions.filter((version) => version.id !== exceptId && version.categoryId === categoryId
    && (!version.effectiveTo || version.effectiveTo >= monthStart(fromMonth)));
}

async function statusOf(executor: Executor, userId: string, budget: Budget, month: string, index: Map<string, CategoryInfo>) {
  const ctx = await context(executor, userId, month, index);
  return toStatus(ctx, budget);
}

async function insertBudget(tx: Executor, userId: string, input: BudgetInput, index: Map<string, CategoryInfo>): Promise<Budget> {
  const fromMonth = input.fromMonth ?? currentMonth();
  if (input.categoryId) assertExpenseCategory(index, input.categoryId);
  for (const id of input.excludedCategoryIds ?? []) if (!index.has(id)) throw new ApiError(404, "NOT_FOUND", "Категория не найдена");
  const existing = await tx.select().from(budgets).where(and(eq(budgets.userId, userId), isNull(budgets.deletedAt)));
  if (overlaps(existing, input.categoryId, fromMonth).length) {
    throw new ApiError(409, "DUPLICATE_RESOURCE", input.categoryId ? "На эту категорию уже есть бюджет в этом месяце" : "Общий бюджет на этот месяц уже есть");
  }
  const [row] = await tx.insert(budgets).values({
    id: input.id ?? randomUUID(),
    userId,
    categoryId: input.categoryId,
    amount: input.amount,
    effectiveFrom: monthStart(fromMonth),
    rollover: input.rollover ?? false,
    excludedCategoryIds: input.categoryId ? [] : input.excludedCategoryIds ?? [],
    alertThresholds: input.alertThresholds ?? [80, 100],
  }).returning();
  return row;
}

/** Повтор с тем же id у того же пользователя возвращает уже созданный бюджет. */
export async function createBudget(userId: string, input: BudgetInput) {
  const index = await categoryIndex(userId);
  const result = await db.transaction(async (tx) => {
    await lockUser(tx, userId);
    if (input.id) {
      const [existing] = await tx.select().from(budgets).where(eq(budgets.id, input.id));
      if (existing) {
        if (existing.userId !== userId) throw new ApiError(409, "DUPLICATE_RESOURCE", "Такой id уже занят");
        return { budget: existing, created: false };
      }
    }
    return { budget: await insertBudget(tx, userId, input, index), created: true };
  });
  return { ...result, status: await statusOf(db, userId, result.budget, input.fromMonth ?? currentMonth(), index) };
}

export async function createBudgets(userId: string, items: Array<{ categoryId: string; amount: string }>, fromMonth = currentMonth()) {
  const index = await categoryIndex(userId);
  const created = await db.transaction(async (tx) => {
    await lockUser(tx, userId);
    const existing = await tx.select().from(budgets).where(and(eq(budgets.userId, userId), isNull(budgets.deletedAt)));
    const conflicts = items.filter((item) => overlaps(existing, item.categoryId, fromMonth).length).map((item) => item.categoryId);
    const duplicates = items.filter((item, i) => items.findIndex((other) => other.categoryId === item.categoryId) !== i).map((item) => item.categoryId);
    if (conflicts.length || duplicates.length) {
      throw new ApiError(409, "DUPLICATE_RESOURCE", "На часть категорий уже есть бюджет", { categoryIds: [...new Set([...conflicts, ...duplicates])] });
    }
    const rows: Budget[] = [];
    for (const item of items) rows.push(await insertBudget(tx, userId, { ...item, fromMonth }, index));
    return rows;
  });
  const ctx = await context(db, userId, fromMonth, index);
  return created.map((budget) => toStatus(ctx, budget));
}

async function getOwnBudget(tx: Executor, userId: string, id: string, forUpdate = false): Promise<Budget> {
  const query = tx.select().from(budgets).where(and(eq(budgets.id, id), eq(budgets.userId, userId), isNull(budgets.deletedAt)));
  const [row] = forUpdate ? await query.for("update") : await query;
  if (!row) throw new ApiError(404, "NOT_FOUND", "Бюджет не найден");
  return row;
}

export interface BudgetPatch {
  amount?: string;
  rollover?: boolean;
  alertThresholds?: number[];
  excludedCategoryIds?: string[];
  fromMonth?: string;
}

/**
 * Смена суммы с месяца позже начала версии закрывает её последним днём прошлого месяца и открывает новую —
 * прошлые месяцы считаются по старой сумме. Остальные поля меняются на месте.
 */
export async function updateBudget(userId: string, id: string, patch: BudgetPatch) {
  const index = await categoryIndex(userId);
  const fromMonth = patch.fromMonth ?? currentMonth();
  for (const excluded of patch.excludedCategoryIds ?? []) if (!index.has(excluded)) throw new ApiError(404, "NOT_FOUND", "Категория не найдена");
  const budget = await db.transaction(async (tx) => {
    await lockUser(tx, userId);
    const current = await getOwnBudget(tx, userId, id, true);
    const fields = {
      ...(patch.rollover !== undefined ? { rollover: patch.rollover } : {}),
      ...(patch.alertThresholds ? { alertThresholds: patch.alertThresholds } : {}),
      ...(patch.excludedCategoryIds && !current.categoryId ? { excludedCategoryIds: patch.excludedCategoryIds } : {}),
    };
    const amountChanges = patch.amount !== undefined && toKopecks(patch.amount) !== toKopecks(current.amount);
    if (amountChanges && monthStart(fromMonth) > current.effectiveFrom) {
      if (current.effectiveTo && current.effectiveTo < monthStart(fromMonth)) {
        throw new ApiError(409, "OPERATION_NOT_ALLOWED", "Бюджет в этом месяце уже не действует");
      }
      await tx.update(budgets).set({ effectiveTo: lastDayBefore(fromMonth), updatedAt: new Date() }).where(eq(budgets.id, current.id));
      const [next] = await tx.insert(budgets).values({
        userId,
        categoryId: current.categoryId,
        amount: patch.amount!,
        effectiveFrom: monthStart(fromMonth),
        effectiveTo: current.effectiveTo,
        rollover: current.rollover,
        excludedCategoryIds: current.excludedCategoryIds,
        alertThresholds: current.alertThresholds,
        ...fields,
      }).returning();
      return next;
    }
    const [updated] = await tx.update(budgets)
      .set({ ...fields, ...(amountChanges ? { amount: patch.amount } : {}), updatedAt: new Date() })
      .where(eq(budgets.id, current.id)).returning();
    return updated;
  });
  const month = monthStart(fromMonth) < budget.effectiveFrom ? budget.effectiveFrom.slice(0, 7) : fromMonth;
  return statusOf(db, userId, budget, month, index);
}

/** Удаление с месяца: раньше начала версии — удаляется вся, иначе версия закрывается прошлым месяцем. */
export async function deleteBudget(userId: string, id: string, fromMonth = currentMonth()) {
  await db.transaction(async (tx) => {
    await lockUser(tx, userId);
    const current = await getOwnBudget(tx, userId, id, true);
    if (monthStart(fromMonth) <= current.effectiveFrom) {
      await tx.update(budgets).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(budgets.id, current.id));
    } else if (!current.effectiveTo || current.effectiveTo >= monthStart(fromMonth)) {
      await tx.update(budgets).set({ effectiveTo: lastDayBefore(fromMonth), updatedAt: new Date() }).where(eq(budgets.id, current.id));
    }
  });
}

// ---------- предложения ----------

const SUGGEST_STEP = 50_000n; // 500 ₽
const SUGGEST_MIN = 100_000n; // 1 000 ₽

function median(values: bigint[]): bigint {
  const sorted = [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2n;
}

/** Медиана трат категории верхнего уровня за 3 полных прошлых месяца, вверх до 500 ₽; от 1 000 ₽, не больше 8. */
export async function suggestBudgets(userId: string) {
  const month = currentMonth();
  const [index, spending, versions] = await Promise.all([
    categoryIndex(userId),
    spendingByMonth(db, userId, shiftMonth(month, -3), shiftMonth(month, -1)),
    loadVersions(db, userId, month, month),
  ]);
  const budgeted = new Set(versions.filter(activeAt(month)).map((budget) => budget.categoryId));
  const months = [1, 2, 3].map((back) => shiftMonth(month, -back));

  const suggestions: Array<{ categoryId: string; name: string; median3m: string; suggestedAmount: string; median: bigint }> = [];
  for (const [id, info] of index) {
    if (info.parentId || info.node.kind !== "expense" || info.node.hidden || budgeted.has(id)) continue;
    const perMonth = months.map((m) => info.subtree.reduce((sum, child) => sum + (spending.get(m)?.get(child) ?? 0n), 0n));
    const value = median(perMonth);
    if (value < SUGGEST_MIN) continue;
    const rounded = ((value + SUGGEST_STEP - 1n) / SUGGEST_STEP) * SUGGEST_STEP;
    suggestions.push({ categoryId: id, name: info.node.name, median3m: fromKopecks(value), suggestedAmount: fromKopecks(rounded), median: value });
  }
  return suggestions
    .sort((a, b) => (b.median > a.median ? 1 : b.median < a.median ? -1 : 0))
    .slice(0, 8)
    .map(({ median: _median, ...rest }) => rest);
}
