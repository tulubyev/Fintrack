/**
 * Цели v2 (E1.4-T5). Текущая сумма — сумма взносов или, если цель привязана к счёту, остаток счёта
 * (минус остаток на момент привязки при «считать только новые деньги»). Прогноз — по среднему приросту за 90 дней.
 * savings_goals.current_amount — кеш для сводки на главной и AI, сервис обновляет его при каждом расчёте.
 */
import { randomUUID } from "node:crypto";
import { and, desc, eq, gt, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { accounts, goalContributions, savingsGoals, transactions, type Account, type SavingsGoal } from "@shared/schema";
import { db } from "../db";
import { ApiError } from "../lib/apiError";
import { fromKopecks, toKopecks } from "../lib/money";
import { track } from "./analytics";
import { notify } from "./notificationService";
import { getOwnAccount, type Executor } from "./ledgerService";

const GROWTH_DAYS = 90;
// Копить можно на счетах с положительным остатком; долговые счета для цели не подходят
const LINKABLE_KINDS = new Set(["debit_card", "current", "cash", "savings", "deposit", "brokerage", "iis", "digital_ruble", "other"]);

// ---------- даты ----------

export const todayMsk = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow" }).format(new Date());

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** «2026-10-19» + 3 месяца → «2027-01-19»; 31 января + 1 → 28/29 февраля. */
export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const last = new Date(Date.UTC(y, m - 1 + months + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1 + months, Math.min(d, last))).toISOString().slice(0, 10);
}

/** Полных месяцев от from до to, но не меньше 1: «нужный взнос» не делится на 0 и на доли месяца. */
export function monthsUntil(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  return Math.max(1, (ty - fy) * 12 + (tm - fm) - (td < fd ? 1 : 0));
}

const ceilDiv = (a: bigint, b: bigint) => (a + b - 1n) / b;

// ---------- расчёт ----------

export interface GoalDto {
  id: string;
  name: string;
  description: string | null;
  targetAmount: string;
  currentAmount: string;
  percent: number;
  targetDate: string | null;
  accountId: string | null;
  countOnlyNewMoney: boolean;
  forecastDate: string | null;
  monthlyNeeded: string | null;
  avgMonthlyGrowth: string;
  onTrack: boolean | null;
  completedAt: Date | null;
  archivedAt: Date | null;
  icon: string | null;
  color: string | null;
  createdAt: Date | null;
}

/**
 * Прогноз: при среднем приросте ≤ 0 цель не будет достигнута (null); иначе сегодня + ⌈остаток / прирост⌉ месяцев.
 * Нужный взнос: остаток / месяцев до срока (не меньше одного), до рубля вверх.
 */
export function forecast(input: { target: bigint; current: bigint; growth: bigint; targetDate: string | null; today: string }) {
  const left = input.target - input.current;
  const done = left <= 0n;
  const forecastDate = done || input.growth <= 0n ? null : addMonths(input.today, Number(ceilDiv(left, input.growth)));
  const monthlyNeeded = done || !input.targetDate ? null : ceilDiv(ceilDiv(left, BigInt(monthsUntil(input.today, input.targetDate))), 100n) * 100n;
  const onTrack = done ? true : !input.targetDate ? null : forecastDate !== null && forecastDate <= input.targetDate;
  return { forecastDate, monthlyNeeded, onTrack };
}

interface Facts {
  contributions: Map<string, bigint>;
  recentContributions: Map<string, bigint>;
  accounts: Map<string, Account>;
  recentAccountFlow: Map<string, bigint>;
}

async function loadFacts(executor: Executor, goals: SavingsGoal[], today: string): Promise<Facts> {
  const ids = goals.map((goal) => goal.id);
  const accountIds = [...new Set(goals.map((goal) => goal.accountId).filter((id): id is string => Boolean(id)))];
  const since = addDays(today, -GROWTH_DAYS);
  const live = and(inArray(goalContributions.goalId, ids), isNull(goalContributions.deletedAt));
  const [sums, recent, accountRows, flows] = await Promise.all([
    ids.length ? executor.select({ goalId: goalContributions.goalId, total: sql<string>`sum(${goalContributions.amount})::text` })
      .from(goalContributions).where(live).groupBy(goalContributions.goalId) : [],
    ids.length ? executor.select({ goalId: goalContributions.goalId, total: sql<string>`sum(${goalContributions.amount})::text` })
      .from(goalContributions).where(and(live, gt(goalContributions.date, since))).groupBy(goalContributions.goalId) : [],
    accountIds.length ? executor.select().from(accounts).where(and(inArray(accounts.id, accountIds), isNull(accounts.deletedAt))) : [],
    // изменение остатка счёта за 90 дней = сумма проведённых операций за это время
    accountIds.length ? executor.select({ accountId: transactions.accountId, total: sql<string>`sum(${transactions.amount})::text` })
      .from(transactions)
      .where(and(inArray(transactions.accountId, accountIds), isNull(transactions.deletedAt), eq(transactions.status, "posted"), gt(transactions.localDate, since)))
      .groupBy(transactions.accountId) : [],
  ]);
  return {
    contributions: new Map(sums.map((row) => [row.goalId, toKopecks(row.total)])),
    recentContributions: new Map(recent.map((row) => [row.goalId, toKopecks(row.total)])),
    accounts: new Map(accountRows.map((row) => [row.id, row])),
    recentAccountFlow: new Map(flows.map((row) => [row.accountId, toKopecks(row.total)])),
  };
}

function currentOf(goal: SavingsGoal, facts: Facts): bigint {
  const account = goal.accountId ? facts.accounts.get(goal.accountId) : undefined;
  if (account) {
    const value = toKopecks(account.balance) - (goal.accountBaseline ? toKopecks(goal.accountBaseline) : 0n);
    return value > 0n ? value : 0n;
  }
  const total = facts.contributions.get(goal.id) ?? 0n;
  return total > 0n ? total : 0n;
}

function toDto(goal: SavingsGoal, facts: Facts, today: string): GoalDto {
  const target = toKopecks(goal.targetAmount);
  const current = currentOf(goal, facts);
  const linked = Boolean(goal.accountId && facts.accounts.has(goal.accountId));
  const delta = linked ? facts.recentAccountFlow.get(goal.accountId!) ?? 0n : facts.recentContributions.get(goal.id) ?? 0n;
  const growth = delta / 3n; // средний прирост в месяц за 90 дней
  const { forecastDate, monthlyNeeded, onTrack } = forecast({ target, current, growth, targetDate: goal.targetDate, today });
  return {
    id: goal.id,
    name: goal.name,
    description: goal.description,
    targetAmount: goal.targetAmount,
    currentAmount: fromKopecks(current),
    percent: Number((current * 100n) / target),
    targetDate: goal.targetDate,
    accountId: linked ? goal.accountId : null,
    countOnlyNewMoney: linked && goal.accountBaseline !== null,
    forecastDate,
    monthlyNeeded: monthlyNeeded === null ? null : fromKopecks(monthlyNeeded),
    avgMonthlyGrowth: fromKopecks(growth),
    onTrack,
    completedAt: goal.completedAt,
    archivedAt: goal.archivedAt,
    icon: goal.icon,
    color: goal.color,
    createdAt: goal.createdAt,
  };
}

/**
 * Считает цели и синхронизирует кеш: current_amount и отметку о достижении. Достижение — один раз:
 * уведомление «goal_reached» с dedupKey и событие goal_completed. Если сумма снова ниже цели, отметка снимается.
 */
async function computeGoals(userId: string, goals: SavingsGoal[]): Promise<GoalDto[]> {
  if (!goals.length) return [];
  const today = todayMsk();
  const facts = await loadFacts(db, goals, today);
  const result: GoalDto[] = [];
  for (const goal of goals) {
    const dto = toDto(goal, facts, today);
    const reached = toKopecks(dto.currentAmount) >= toKopecks(goal.targetAmount);
    const cacheStale = goal.currentAmount === null || toKopecks(goal.currentAmount) !== toKopecks(dto.currentAmount);
    const completedAt = reached ? goal.completedAt ?? new Date() : null;
    if (cacheStale || (completedAt === null) !== (goal.completedAt === null)) {
      await db.update(savingsGoals).set({ currentAmount: dto.currentAmount, completedAt, updatedAt: new Date() }).where(eq(savingsGoals.id, goal.id));
      dto.completedAt = completedAt;
    }
    if (reached && !goal.completedAt && !goal.archivedAt) {
      const created = await notify(userId, {
        type: "goal_reached",
        title: `Цель «${goal.name}» достигнута`,
        body: "Поздравляем! Можно отправить её в архив или поставить новую",
        deepLink: "/goals",
        dedupKey: `goal:${goal.id}:reached`,
        payload: { goalId: goal.id },
      });
      if (created) {
        const days = goal.createdAt ? Math.round((Date.now() - goal.createdAt.getTime()) / 86_400_000) : null;
        void track("goal_completed", { userId, props: { days_to_complete: days } });
      }
    }
    result.push(dto);
  }
  return result;
}

const own = (userId: string, id: string) => and(eq(savingsGoals.id, id), eq(savingsGoals.userId, userId), isNull(savingsGoals.deletedAt));

async function getOwnGoal(executor: Executor, userId: string, id: string, forUpdate = false): Promise<SavingsGoal> {
  const query = executor.select().from(savingsGoals).where(own(userId, id));
  const [row] = forUpdate ? await query.for("update") : await query;
  if (!row) throw new ApiError(404, "NOT_FOUND", "Цель не найдена");
  return row;
}

// ---------- чтение ----------

export async function listGoals(userId: string, includeArchived = false): Promise<GoalDto[]> {
  const conditions: SQL[] = [eq(savingsGoals.userId, userId), isNull(savingsGoals.deletedAt)];
  if (!includeArchived) conditions.push(isNull(savingsGoals.archivedAt));
  const rows = await db.select().from(savingsGoals).where(and(...conditions)).orderBy(desc(savingsGoals.createdAt)).limit(200);
  const items = await computeGoals(userId, rows);
  // сначала активные, затем достигнутые, архив — в конце
  const rank = (goal: GoalDto) => (goal.archivedAt ? 2 : goal.completedAt ? 1 : 0);
  return items.sort((a, b) => rank(a) - rank(b));
}

export async function getGoal(userId: string, id: string): Promise<GoalDto> {
  const [dto] = await computeGoals(userId, [await getOwnGoal(db, userId, id)]);
  return dto;
}

// ---------- счёт ----------

async function linkableAccount(executor: Executor, userId: string, accountId: string): Promise<Account> {
  const account = await getOwnAccount(executor, userId, accountId);
  if (account.archivedAt) throw new ApiError(409, "OPERATION_NOT_ALLOWED", "Счёт в архиве");
  if (!LINKABLE_KINDS.has(account.kind)) throw new ApiError(400, "VALIDATION_ERROR", "Цель нельзя привязать к кредиту или кредитной карте");
  if ((account.currency ?? "RUB") !== "RUB") throw new ApiError(400, "VALIDATION_ERROR", "Привязать можно только рублёвый счёт");
  return account;
}

async function contributionsTotal(executor: Executor, goalId: string): Promise<bigint> {
  const [row] = await executor.select({ total: sql<string>`coalesce(sum(${goalContributions.amount}), 0)::text` })
    .from(goalContributions).where(and(eq(goalContributions.goalId, goalId), isNull(goalContributions.deletedAt)));
  return toKopecks(row.total);
}

/**
 * При отвязке накопленное по счёту фиксируется взносом «Перенос остатка»: после отвязки сумма цели не меняется.
 */
async function unlinkAccount(tx: Executor, userId: string, goal: SavingsGoal) {
  const [account] = goal.accountId ? await tx.select().from(accounts).where(eq(accounts.id, goal.accountId)) : [];
  if (account) {
    let fromAccount = toKopecks(account.balance) - (goal.accountBaseline ? toKopecks(goal.accountBaseline) : 0n);
    if (fromAccount < 0n) fromAccount = 0n;
    const diff = fromAccount - (await contributionsTotal(tx, goal.id));
    if (diff !== 0n) {
      await tx.insert(goalContributions).values({ goalId: goal.id, userId, amount: fromKopecks(diff), date: todayMsk(), note: "Перенос остатка" });
    }
  }
}

// ---------- изменения ----------

export interface GoalInput {
  id?: string;
  name: string;
  targetAmount: string;
  targetDate?: string | null;
  accountId?: string | null;
  countOnlyNewMoney?: boolean;
  initialAmount?: string;
  icon?: string | null;
  color?: string | null;
  description?: string | null;
}

/** Создание идемпотентно по id: повтор того же запроса возвращает цель; чужой id — 409. */
export async function createGoal(userId: string, input: GoalInput): Promise<{ goal: GoalDto; created: boolean }> {
  if (input.accountId && input.initialAmount && toKopecks(input.initialAmount) !== 0n) {
    throw new ApiError(400, "VALIDATION_ERROR", "Для цели со счётом сумма считается по остатку — начальная сумма не нужна");
  }
  const result = await db.transaction(async (tx) => {
    if (input.id) {
      const [existing] = await tx.select().from(savingsGoals).where(eq(savingsGoals.id, input.id));
      if (existing) {
        if (existing.userId !== userId || existing.deletedAt) throw new ApiError(409, "DUPLICATE_RESOURCE", "Цель с таким id уже есть");
        return { row: existing, created: false };
      }
    }
    const account = input.accountId ? await linkableAccount(tx, userId, input.accountId) : null;
    const [row] = await tx.insert(savingsGoals).values({
      id: input.id ?? randomUUID(),
      userId,
      name: input.name,
      description: input.description ?? null,
      targetAmount: input.targetAmount,
      targetDate: input.targetDate ?? null,
      accountId: account?.id ?? null,
      accountBaseline: account && input.countOnlyNewMoney ? account.balance : null,
      icon: input.icon ?? null,
      color: input.color ?? null,
      currentAmount: "0",
    }).returning();
    if (!account && input.initialAmount && toKopecks(input.initialAmount) > 0n) {
      await tx.insert(goalContributions).values({ goalId: row.id, userId, amount: input.initialAmount, date: todayMsk(), note: "Начальная сумма" });
    }
    return { row, created: true };
  });
  const [goal] = await computeGoals(userId, [result.row]);
  return { goal, created: result.created };
}

export interface GoalPatch {
  name?: string;
  targetAmount?: string;
  targetDate?: string | null;
  accountId?: string | null;
  countOnlyNewMoney?: boolean;
  icon?: string | null;
  color?: string | null;
  description?: string | null;
}

export async function updateGoal(userId: string, id: string, patch: GoalPatch): Promise<GoalDto> {
  const row = await db.transaction(async (tx) => {
    const goal = await getOwnGoal(tx, userId, id, true);
    const fields: Partial<SavingsGoal> = {};
    for (const key of ["name", "targetAmount", "targetDate", "icon", "color", "description"] as const) {
      if (patch[key] !== undefined) (fields as Record<string, unknown>)[key] = patch[key];
    }
    if (patch.accountId !== undefined && patch.accountId !== goal.accountId) {
      if (goal.accountId) await unlinkAccount(tx, userId, goal);
      if (patch.accountId) {
        const account = await linkableAccount(tx, userId, patch.accountId);
        fields.accountId = account.id;
        fields.accountBaseline = patch.countOnlyNewMoney ? account.balance : null;
      } else {
        fields.accountId = null;
        fields.accountBaseline = null;
      }
    } else if (patch.countOnlyNewMoney !== undefined && goal.accountId && patch.countOnlyNewMoney !== (goal.accountBaseline !== null)) {
      const [account] = await tx.select().from(accounts).where(eq(accounts.id, goal.accountId));
      fields.accountBaseline = patch.countOnlyNewMoney && account ? account.balance : null;
    }
    const [updated] = await tx.update(savingsGoals).set({ ...fields, updatedAt: new Date() }).where(eq(savingsGoals.id, goal.id)).returning();
    return updated;
  });
  const [dto] = await computeGoals(userId, [row]);
  return dto;
}

export async function setGoalArchived(userId: string, id: string, archived: boolean): Promise<GoalDto> {
  await getOwnGoal(db, userId, id);
  const [row] = await db.update(savingsGoals).set({ archivedAt: archived ? new Date() : null, updatedAt: new Date() })
    .where(own(userId, id)).returning();
  const [dto] = await computeGoals(userId, [row]);
  return dto;
}

export async function deleteGoal(userId: string, id: string): Promise<void> {
  await getOwnGoal(db, userId, id);
  await db.update(savingsGoals).set({ deletedAt: new Date(), updatedAt: new Date() }).where(own(userId, id));
}

// ---------- взносы ----------

export interface ContributionDto {
  id: string;
  amount: string;
  date: string;
  note: string | null;
  transactionId: string | null;
  createdAt: Date;
}

const toContributionDto = (row: typeof goalContributions.$inferSelect): ContributionDto => ({
  id: row.id, amount: row.amount, date: row.date, note: row.note, transactionId: row.transactionId, createdAt: row.createdAt,
});

const encodeCursor = (parts: string[]) => Buffer.from(JSON.stringify(parts)).toString("base64url");
function decodeCursor(cursor: string): [string, string, string] {
  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (Array.isArray(value) && value.length === 3 && value.every((part) => typeof part === "string")) return value as [string, string, string];
  } catch { /* ниже — общая ошибка */ }
  throw new ApiError(400, "VALIDATION_ERROR", "Некорректный курсор");
}

export async function listContributions(userId: string, goalId: string, options: { limit: number; cursor?: string }) {
  await getOwnGoal(db, userId, goalId);
  const conditions: SQL[] = [eq(goalContributions.goalId, goalId), isNull(goalContributions.deletedAt)];
  if (options.cursor) {
    const [date, createdAt, id] = decodeCursor(options.cursor);
    conditions.push(sql`(${goalContributions.date}, ${goalContributions.createdAt}, ${goalContributions.id}) < (${date}::date, ${createdAt}::timestamptz, ${id}::uuid)`);
  }
  const rows = await db.select({
    row: goalContributions,
    // микросекунды: иначе две записи в одну миллисекунду ломают курсор
    createdAtText: sql<string>`to_char(${goalContributions.createdAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
  }).from(goalContributions).where(and(...conditions))
    .orderBy(desc(goalContributions.date), desc(goalContributions.createdAt), desc(goalContributions.id))
    .limit(options.limit + 1);
  const page = rows.slice(0, options.limit);
  const last = page[page.length - 1];
  return {
    items: page.map(({ row }) => toContributionDto(row)),
    nextCursor: rows.length > options.limit && last ? encodeCursor([last.row.date, last.createdAtText, last.row.id]) : null,
  };
}

export interface ContributionInput {
  id?: string;
  amount: string;
  date?: string;
  note?: string | null;
  transactionId?: string | null;
}

export async function addContribution(userId: string, goalId: string, input: ContributionInput) {
  const today = todayMsk();
  const date = input.date ?? today;
  if (date > today) throw new ApiError(400, "VALIDATION_ERROR", "Дата взноса — не позже сегодня");
  const result = await db.transaction(async (tx) => {
    const goal = await getOwnGoal(tx, userId, goalId, true);
    if (input.id) {
      const [existing] = await tx.select().from(goalContributions).where(eq(goalContributions.id, input.id));
      if (existing) {
        if (existing.userId !== userId || existing.goalId !== goalId) throw new ApiError(409, "DUPLICATE_RESOURCE", "Взнос с таким id уже есть");
        return { row: existing, goal, created: false };
      }
    }
    if (goal.accountId) throw new ApiError(409, "OPERATION_NOT_ALLOWED", "Цель привязана к счёту: сумма считается по его остатку");
    if (goal.archivedAt) throw new ApiError(409, "OPERATION_NOT_ALLOWED", "Цель в архиве");
    if (input.transactionId) {
      const [transaction] = await tx.select({ id: transactions.id }).from(transactions)
        .where(and(eq(transactions.id, input.transactionId), eq(transactions.userId, userId), isNull(transactions.deletedAt)));
      if (!transaction) throw new ApiError(404, "NOT_FOUND", "Операция не найдена");
    }
    const amount = toKopecks(input.amount);
    if (amount < 0n && (await contributionsTotal(tx, goalId)) + amount < 0n) {
      throw new ApiError(409, "OPERATION_NOT_ALLOWED", "Нельзя снять больше, чем накоплено");
    }
    const [row] = await tx.insert(goalContributions).values({
      id: input.id ?? randomUUID(), goalId, userId, amount: input.amount, date, note: input.note ?? null, transactionId: input.transactionId ?? null,
    }).returning();
    return { row, goal, created: true };
  });
  const [goal] = await computeGoals(userId, [await getOwnGoal(db, userId, goalId)]);
  return { contribution: toContributionDto(result.row), goal, created: result.created };
}

export async function deleteContribution(userId: string, goalId: string, contributionId: string): Promise<GoalDto> {
  await db.transaction(async (tx) => {
    await getOwnGoal(tx, userId, goalId, true);
    const deleted = await tx.update(goalContributions).set({ deletedAt: new Date(), updatedAt: new Date() }).where(and(
      eq(goalContributions.id, contributionId), eq(goalContributions.goalId, goalId), eq(goalContributions.userId, userId), isNull(goalContributions.deletedAt),
    )).returning({ id: goalContributions.id });
    if (!deleted.length) throw new ApiError(404, "NOT_FOUND", "Взнос не найден");
    // удалить пополнение, из которого потом сняли, — значит уйти в минус
    if ((await contributionsTotal(tx, goalId)) < 0n) throw new ApiError(409, "OPERATION_NOT_ALLOWED", "Без этого взноса сумма цели станет отрицательной");
  });
  return getGoal(userId, goalId);
}
