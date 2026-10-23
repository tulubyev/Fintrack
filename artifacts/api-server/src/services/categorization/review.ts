/**
 * Разбор «Без категории» (E1.3-T9): операции без категории, сгруппированные по мерчанту или описанию, с предложением
 * нейросети. Категория ставится всей группе сразу; «запомнить» — ещё и правило на будущие операции.
 */
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db, categoryRules, transactions, type Transaction } from "@workspace/db";
import { ApiError } from "../../lib/apiError";
import { getVisible } from "../categoryService";
import { fromKopecks, toKopecks } from "../../lib/money";
import { merchantKey } from "./merchant";

export interface UncategorizedGroup {
  /** Ключ группы: мерчант или описание без номеров и шума; пусто — операции без названия. */
  key: string;
  label: string;
  field: "merchant" | "description";
  type: "expense" | "income";
  count: number;
  /** Сумма по модулю в рублях. */
  totalAmount: string;
  suggestedCategoryId: string | null;
  sampleIds: string[];
}

const MAX_GROUPS = 100;

const groupOf = (row: Transaction) => {
  const merchant = row.merchantNormalized || row.merchant;
  return { key: merchantKey(merchant || row.description || ""), field: merchant ? "merchant" as const : "description" as const, label: (merchant || row.description || "").trim() };
};

async function uncategorizedRows(userId: string): Promise<Transaction[]> {
  return db.select().from(transactions).where(and(
    eq(transactions.userId, userId), isNull(transactions.deletedAt), isNull(transactions.categoryId),
    inArray(transactions.type, ["expense", "income"]),
  ));
}

/** Самое частое значение (для подписи группы и предложения нейросети). */
function mode<T>(values: T[]): T | null {
  const counts = new Map<T, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

export async function uncategorizedGroups(userId: string): Promise<{ groups: UncategorizedGroup[]; total: number }> {
  const rows = await uncategorizedRows(userId);
  const groups = new Map<string, { rows: Transaction[]; field: "merchant" | "description"; labels: string[] }>();
  for (const row of rows) {
    const { key, field, label } = groupOf(row);
    const id = `${row.type}|${key}`;
    const group = groups.get(id) ?? { rows: [], field, labels: [] };
    group.rows.push(row);
    group.labels.push(label);
    groups.set(id, group);
  }
  const result = [...groups.entries()].map(([id, group]): UncategorizedGroup => {
    const total = group.rows.reduce((sum, row) => {
      const kopecks = toKopecks(row.amountRub ?? row.amount);
      return sum + (kopecks < 0n ? -kopecks : kopecks);
    }, 0n);
    return {
      key: id.slice(id.indexOf("|") + 1),
      label: mode(group.labels.filter(Boolean)) ?? "Без названия",
      field: group.field,
      type: group.rows[0].type as "expense" | "income",
      count: group.rows.length,
      totalAmount: fromKopecks(total),
      suggestedCategoryId: mode(group.rows.map((row) => row.suggestedCategoryId).filter((value): value is string => Boolean(value))),
      sampleIds: group.rows.slice(0, 5).map((row) => row.id),
    };
  }).sort((a, b) => b.count - a.count || Number(b.totalAmount) - Number(a.totalAmount));
  return { groups: result.slice(0, MAX_GROUPS), total: rows.length };
}

/**
 * Категория всей группе. remember — правило «мерчант (или описание) содержит ключ» на будущие операции: повтор
 * с тем же ключом меняет категорию правила, а не создаёт второе.
 */
export async function applyToGroup(userId: string, input: { key: string; type: "expense" | "income"; categoryId: string; remember: boolean })
  : Promise<{ updated: number; ruleCreated: boolean; ruleId: string | null }> {
  const category = await getVisible(db, userId, input.categoryId);
  if (category.kind !== input.type) throw new ApiError(400, "VALIDATION_ERROR", input.type === "expense" ? "Нужна категория расходов" : "Нужна категория доходов");
  const rows = (await uncategorizedRows(userId)).filter((row) => row.type === input.type && groupOf(row).key === input.key);
  if (!rows.length) return { updated: 0, ruleCreated: false, ruleId: null };

  let ruleId: string | null = null;
  let ruleCreated = false;
  const remember = input.remember && input.key.length >= 2;
  if (remember) {
    const field = groupOf(rows[0]).field;
    const direction = input.type === "income" ? "in" : "out";
    const [existing] = await db.select().from(categoryRules).where(and(
      eq(categoryRules.userId, userId), eq(categoryRules.field, field), eq(categoryRules.op, "contains"),
      eq(categoryRules.pattern, input.key), isNull(categoryRules.accountId), isNull(categoryRules.deletedAt),
    ));
    const [rule] = existing
      ? await db.update(categoryRules).set({ categoryId: input.categoryId, direction, updatedAt: new Date() }).where(eq(categoryRules.id, existing.id)).returning()
      : await db.insert(categoryRules).values({ userId, field, op: "contains", pattern: input.key, categoryId: input.categoryId, direction, source: "correction" }).returning();
    ruleId = rule.id;
    ruleCreated = !existing;
  }
  const updated = await db.update(transactions).set({
    categoryId: input.categoryId,
    categorySource: remember ? "rule_user" : "manual",
    categoryConfidence: remember ? 1 : null,
    suggestedCategoryId: null,
    updatedAt: new Date(),
  }).where(and(eq(transactions.userId, userId), inArray(transactions.id, rows.map((row) => row.id)), isNull(transactions.categoryId)))
    .returning({ id: transactions.id });
  return { updated: updated.length, ruleCreated, ruleId };
}
