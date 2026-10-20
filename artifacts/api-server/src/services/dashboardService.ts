/**
 * Сводка главного экрана (E1.5-T1): баланс, месяц против того же периода прошлого месяца, топ категорий,
 * ближайшие списания, бюджеты, цели, свежесть данных по счетам и шаги онбординга. Деньги — в копейках (bigint).
 * Каждый блок — отдельный запрос по пользователю (без N+1), блоки считаются параллельно.
 */
import { and, eq, isNull, sql } from "drizzle-orm";
import { accounts, transactions, users } from "@shared/schema";
import { db } from "../db";
import { fromKopecks, toKopecks } from "../lib/money";
import { listBudgets, todayMsk, type BudgetStatus } from "./budgetService";
import { listCategoryTree } from "./categoryService";
import { listGoals } from "./goalService";
import { listAccounts } from "./ledgerService";
import { upcoming } from "./recurring/recurringApi";

const TOP_CATEGORIES = 5;
const UPCOMING_DAYS = 14;
const STALE_DAYS = 14;

const daysInMonth = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};
const shiftMonth = (month: string, delta: number) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
};
const day = (month: string, n: number) => `${month}-${String(n).padStart(2, "0")}`;
const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

/** Изменение в процентах с одним знаком; null — сравнивать не с чем. */
function deltaPct(current: bigint, previous: bigint): number | null {
  if (previous <= 0n) return null;
  return Math.round(Number(((current - previous) * 1000n) / previous)) / 10;
}

/**
 * Доходы и траты по категориям за период (как в бюджетах: траты = −Σ amount_rub, возвраты в категории расходов их
 * уменьшают; переводы, корректировки и исключённые из статистики не считаются). null — без категории.
 */
async function totalsByCategory(userId: string, from: string, to: string) {
  const { rows } = await db.execute<{ category_id: string | null; type: string; total: string }>(sql`
    SELECT ${transactions.categoryId} AS category_id, ${transactions.type} AS type, sum(${transactions.amountRub})::text AS total
    FROM ${transactions}
    WHERE ${transactions.userId} = ${userId}
      AND ${transactions.deletedAt} IS NULL AND ${transactions.status} = 'posted' AND ${transactions.excludeFromStats} = false
      AND ${transactions.amountRub} IS NOT NULL AND ${transactions.type} IN ('income', 'expense')
      AND ${transactions.localDate} BETWEEN ${from}::date AND ${to}::date
    GROUP BY 1, 2
  `);
  return rows.map((row) => ({ categoryId: row.category_id, type: row.type, total: toKopecks(row.total) }));
}

type CategoryTotals = Awaited<ReturnType<typeof totalsByCategory>>;

function incomeExpense(rows: CategoryTotals) {
  let income = 0n;
  let expense = 0n;
  for (const row of rows) {
    if (row.type === "income") income += row.total;
    else expense -= row.total;
  }
  return { income, expense };
}

async function periodBlock(userId: string, month: string, today: string) {
  const current = month === today.slice(0, 7);
  const total = daysInMonth(month);
  const passed = current ? Number(today.slice(8, 10)) : total;
  const prevMonth = shiftMonth(month, -1);
  // тот же период прошлого месяца: 1–17 октября против 1–17 сентября (в коротком месяце — до его конца)
  const prevTo = day(prevMonth, Math.min(passed, daysInMonth(prevMonth)));
  const [now, prev] = await Promise.all([
    totalsByCategory(userId, day(month, 1), day(month, passed)),
    totalsByCategory(userId, day(prevMonth, 1), prevTo),
  ]);
  const a = incomeExpense(now);
  const b = incomeExpense(prev);
  return {
    now,
    prev,
    period: {
      from: day(month, 1),
      to: day(month, passed),
      income: fromKopecks(a.income),
      expense: fromKopecks(a.expense),
      net: fromKopecks(a.income - a.expense),
      expensePrevSamePeriod: fromKopecks(b.expense),
      expenseDeltaPct: deltaPct(a.expense, b.expense),
      daysPassed: passed,
      daysInMonth: total,
    },
  };
}

/** Топ родительских категорий расходов: возвраты уменьшают траты, ≤ 5 строк и «Остальное». */
async function topCategories(userId: string, now: CategoryTotals, prev: CategoryTotals) {
  const tree = await listCategoryTree(userId, { includeHidden: true });
  const parentOf = new Map<string, string>();
  for (const parent of tree) {
    parentOf.set(parent.id, parent.id);
    for (const child of parent.children) parentOf.set(child.id, parent.id);
  }
  const nodes = new Map(tree.map((node) => [node.id, node]));
  const isExpense = (id: string | null) => id === null || nodes.get(parentOf.get(id) ?? "")?.kind === "expense";

  const spentByParent = (rows: CategoryTotals) => {
    const result = new Map<string | null, bigint>();
    for (const row of rows) {
      if (row.type === "income" && row.categoryId === null) continue; // доход без категории — не возврат
      if (!isExpense(row.categoryId)) continue;
      const key = row.categoryId === null ? null : parentOf.get(row.categoryId)!;
      result.set(key, (result.get(key) ?? 0n) - row.total);
    }
    return result;
  };
  const current = spentByParent(now);
  const previous = spentByParent(prev);
  const total = [...current.values()].reduce((sum, value) => sum + (value > 0n ? value : 0n), 0n);
  const ranked = [...current].filter(([, value]) => value > 0n).sort((x, y) => (y[1] > x[1] ? 1 : y[1] < x[1] ? -1 : 0));
  const share = (value: bigint) => (total > 0n ? Math.round(Number((value * 1000n) / total)) / 1000 : 0);

  const items = ranked.slice(0, TOP_CATEGORIES).map(([id, value]) => {
    const node = id ? nodes.get(id) : undefined;
    return {
      categoryId: id,
      name: node?.name ?? "Без категории",
      icon: node?.icon ?? null,
      color: node?.color ?? null,
      amount: fromKopecks(value),
      share: share(value),
      deltaPct: deltaPct(value, previous.get(id) ?? 0n),
    };
  });
  const rest = ranked.slice(TOP_CATEGORIES).reduce((sum, [, value]) => sum + value, 0n);
  return { items, other: rest > 0n ? { amount: fromKopecks(rest), share: share(rest) } : null, total: fromKopecks(total) };
}

function budgetsBlock(list: Awaited<ReturnType<typeof listBudgets>>) {
  if (!list.items.length) return null;
  const all: BudgetStatus[] = list.items.flatMap((item) => [item, ...(item.children ?? [])]);
  return {
    count: all.length,
    over: all.filter((item) => item.status === "over").length,
    warning: all.filter((item) => item.status === "warning").length,
    top: [...list.items].sort((x, y) => y.percent - x.percent).slice(0, 3),
  };
}

/** Последняя операция по каждому счёту; устарел — импортный счёт без операций дольше 14 дней. */
async function freshness(userId: string, today: string) {
  const { rows } = await db.execute<{ id: string; name: string; source: string; last_date: string | null; last_source: string | null }>(sql`
    SELECT a.id, a.account_name AS name, a.source, last.local_date::text AS last_date, last.source AS last_source
    FROM ${accounts} a
    LEFT JOIN LATERAL (
      SELECT t.local_date, t.source FROM ${transactions} t
      WHERE t.account_id = a.id AND t.user_id = ${userId} AND t.deleted_at IS NULL
      ORDER BY t.local_date DESC NULLS LAST, t.created_at DESC LIMIT 1
    ) last ON true
    WHERE a.user_id = ${userId} AND a.deleted_at IS NULL AND a.archived_at IS NULL
    ORDER BY a.sort_order, a.created_at
  `);
  return rows.map((row) => {
    const source = row.last_source === "import" || row.source === "import" ? "import" : row.source;
    return {
      accountId: row.id,
      name: row.name,
      lastTransactionDate: row.last_date,
      source,
      stale: source === "import" && row.last_date !== null && daysBetween(row.last_date, today) > STALE_DAYS,
    };
  });
}

async function counts(userId: string) {
  const [row] = await db.select({
    txCount: sql<number>`count(*) filter (where ${transactions.type} in ('income', 'expense'))::int`,
    uncategorized: sql<number>`count(*) filter (where ${transactions.type} in ('income', 'expense') and ${transactions.categoryId} is null)::int`,
  }).from(transactions).where(and(eq(transactions.userId, userId), isNull(transactions.deletedAt)));
  const [user] = await db.select({ dismissedAt: users.onboardingDismissedAt }).from(users).where(eq(users.id, userId));
  return { ...row, dismissed: Boolean(user?.dismissedAt) };
}

export async function dashboardSummary(userId: string, month: string) {
  const today = todayMsk();
  const [accountList, period, budgetList, goals, soon, fresh, stats] = await Promise.all([
    listAccounts(userId, false),
    periodBlock(userId, month, today),
    listBudgets(userId, month),
    listGoals(userId, false),
    upcoming(userId, UPCOMING_DAYS),
    freshness(userId, today),
    counts(userId),
  ]);

  const rubByCurrency = new Map<string, bigint>();
  for (const item of accountList.items) {
    if (!item.includeInTotal || item.archivedAt || item.balanceRub === null) continue;
    rubByCurrency.set(item.currency, (rubByCurrency.get(item.currency) ?? 0n) + toKopecks(item.balanceRub));
  }
  const outgoing = soon.items.filter((item) => item.direction === "out");

  return {
    month,
    asOf: today,
    balance: {
      totalRub: accountList.totals.balanceRub,
      byCurrency: accountList.totals.byCurrency.map((item) => ({
        currency: item.currency,
        amount: item.balance,
        amountRub: rubByCurrency.has(item.currency) ? fromKopecks(rubByCurrency.get(item.currency)!) : null,
      })),
      currenciesWithoutRate: accountList.totals.currenciesWithoutRate,
      accountsCount: accountList.items.length,
    },
    period: period.period,
    topCategories: await topCategories(userId, period.now, period.prev),
    budgets: budgetsBlock(budgetList),
    upcoming: {
      items: outgoing.map((item) => ({ seriesId: item.seriesId, name: item.displayName, kind: item.kind, amount: item.amount, currency: item.currency, date: item.date, accountId: item.accountId })),
      total: soon.total,
      days: UPCOMING_DAYS,
    },
    goals: goals.filter((goal) => !goal.completedAt).slice(0, 3),
    uncategorizedCount: stats.uncategorized,
    freshness: fresh,
    onboarding: {
      hasAccount: accountList.items.length > 0,
      hasTransactions: stats.txCount > 0,
      txCount: stats.txCount,
      hasBudget: budgetList.items.length > 0,
      dismissed: stats.dismissed,
    },
  };
}

export async function dismissOnboarding(userId: string) {
  await db.update(users).set({ onboardingDismissedAt: new Date() }).where(eq(users.id, userId));
}
