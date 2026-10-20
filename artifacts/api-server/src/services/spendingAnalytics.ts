/**
 * Аналитика трат и доходов (E1.5-T2): группировка за период по категории, родительской категории, дню, неделе или
 * месяцу и денежный поток по месяцам. Правила те же, что на главной и в бюджетах: суммы в рублях, без переводов,
 * корректировок и исключённых из статистики; возврат (доход в категории расходов) уменьшает траты, а не растит доходы.
 */
import { and, eq, inArray, sql, type SQL } from "drizzle-orm";
import { categories, transactions } from "@shared/schema";
import { db } from "../db";
import { fromKopecks, toKopecks } from "../lib/money";
import { todayMsk } from "./budgetService";
import { listCategoryTree } from "./categoryService";
import { filterConditions, type TransactionFilters } from "./transactionService";

export const GROUP_BY = ["category", "parent_category", "day", "week", "month"] as const;
export type GroupBy = (typeof GROUP_BY)[number];

export interface SpendingQuery {
  from: string;
  to: string;
  groupBy: GroupBy;
  type: "expense" | "income";
  accountIds?: string[];
  categoryIds?: string[];
}

const KEY: Record<GroupBy, SQL<string | null>> = {
  category: sql<string | null>`${transactions.categoryId}::text`,
  parent_category: sql<string | null>`coalesce(${categories.parentId}, ${categories.id})::text`,
  day: sql<string | null>`to_char(${transactions.localDate}, 'YYYY-MM-DD')`,
  week: sql<string | null>`to_char(date_trunc('week', ${transactions.localDate}), 'YYYY-MM-DD')`, // понедельник недели
  month: sql<string | null>`to_char(${transactions.localDate}, 'YYYY-MM')`,
};

export async function spending(userId: string, query: SpendingQuery) {
  const filters: TransactionFilters = { from: query.from, to: query.to, accountIds: query.accountIds, categoryIds: query.categoryIds };
  const conditions = await filterConditions(userId, filters);
  conditions.push(eq(transactions.excludeFromStats, false), eq(transactions.status, "posted"), inArray(transactions.type, ["income", "expense"]));
  // траты: расходы и возвраты в категориях расходов; доходы: доходы без категории или в категориях доходов
  const kind = sql`coalesce(${categories.kind}, 'none')`;
  conditions.push(query.type === "expense"
    ? sql`(${transactions.type} = 'expense' OR (${transactions.type} = 'income' AND ${kind} = 'expense'))`
    : sql`(${transactions.type} = 'income' AND ${kind} <> 'expense')`);
  const sign = query.type === "expense" ? -1 : 1;

  const rows = await db.select({
    key: KEY[query.groupBy],
    amount: sql<string>`coalesce(sum(${transactions.amountRub}), 0)::text`,
    count: sql<number>`count(*)::int`,
  }).from(transactions)
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .where(and(...conditions))
    .groupBy(sql`1`);

  const byCategory = query.groupBy === "category" || query.groupBy === "parent_category";
  const names = new Map<string, { name: string; icon: string | null; color: string | null }>();
  if (byCategory) {
    for (const parent of await listCategoryTree(userId, { includeHidden: true })) {
      names.set(parent.id, parent);
      for (const child of parent.children) names.set(child.id, { name: `${parent.name} · ${child.name}`, icon: child.icon ?? parent.icon, color: child.color ?? parent.color });
    }
  }

  let total = 0n;
  const items = rows.map((row) => {
    const amount = toKopecks(row.amount) * BigInt(sign);
    total += amount;
    const info = row.key ? names.get(row.key) : undefined;
    return {
      key: row.key,
      label: byCategory ? info?.name ?? "Без категории" : row.key,
      icon: info?.icon ?? null,
      color: info?.color ?? null,
      amount,
      count: row.count,
    };
  });
  // категории — по убыванию суммы, периоды — по времени
  items.sort((a, b) => (byCategory ? (b.amount > a.amount ? 1 : b.amount < a.amount ? -1 : 0) : String(a.key).localeCompare(String(b.key))));
  return { items: items.map((item) => ({ ...item, amount: fromKopecks(item.amount) })), total: fromKopecks(total) };
}

const shiftMonth = (month: string, delta: number) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
};

/** Доходы, траты и остаток по последним months месяцам, включая текущий; пустые месяцы — нулями. */
export async function cashflow(userId: string, months: number) {
  const current = todayMsk().slice(0, 7);
  const first = shiftMonth(current, -(months - 1));
  const { rows } = await db.execute<{ month: string; income: string; expense: string }>(sql`
    SELECT to_char(${transactions.localDate}, 'YYYY-MM') AS month,
           coalesce(sum(${transactions.amountRub}) filter (where ${transactions.type} = 'income'), 0)::text AS income,
           coalesce(-sum(${transactions.amountRub}) filter (where ${transactions.type} = 'expense'), 0)::text AS expense
    FROM ${transactions}
    WHERE ${transactions.userId} = ${userId} AND ${transactions.deletedAt} IS NULL AND ${transactions.status} = 'posted'
      AND ${transactions.excludeFromStats} = false AND ${transactions.type} IN ('income', 'expense')
      AND ${transactions.localDate} >= ${`${first}-01`}::date
    GROUP BY 1
  `);
  const byMonth = new Map(rows.map((row) => [row.month, row]));
  const items = [];
  for (let i = 0; i < months; i++) {
    const month = shiftMonth(first, i);
    const income = toKopecks(byMonth.get(month)?.income ?? "0");
    const expense = toKopecks(byMonth.get(month)?.expense ?? "0");
    items.push({ month, income: fromKopecks(income), expense: fromKopecks(expense), net: fromKopecks(income - expense) });
  }
  return { items };
}
