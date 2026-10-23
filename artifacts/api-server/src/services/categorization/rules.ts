/**
 * Правила категоризации пользователя (E1.3-T7): CRUD, предпросмотр совпадений, применение к прошлым операциям и
 * правило из исправления категории («эта и будущие», «эта, будущие и прошлые»). Прошлые операции с ручной категорией
 * (category_source = 'manual') и переводы между счетами правила не трогают никогда.
 */
import { and, asc, desc, eq, inArray, isNull, notInArray, sql } from "drizzle-orm";
import { db, accounts, categories, categoryRules, transactions, type Transaction } from "@workspace/db";
import { ApiError } from "../../lib/apiError";
import { getVisible } from "../categoryService";
import { merchantKey } from "./merchant";
import { normalizeRulePattern, ruleMatches, type CategorizeInput } from "./pipeline";

export type CategoryRule = typeof categoryRules.$inferSelect;
export type ApplyScope = "future" | "future_and_past";

export interface RuleInput {
  field: "merchant" | "description" | "mcc";
  op: "equals" | "contains" | "starts_with";
  pattern: string;
  categoryId: string;
  accountId?: string | null;
  direction?: "in" | "out" | null;
  amountMin?: string | null;
  amountMax?: string | null;
  renameMerchantTo?: string | null;
  priority?: number;
}

export interface RuleDto {
  id: string;
  field: string;
  op: string;
  pattern: string;
  categoryId: string;
  accountId: string | null;
  direction: string | null;
  amountMin: string | null;
  amountMax: string | null;
  renameMerchantTo: string | null;
  priority: number;
  source: string;
  hitCount: number;
  createdAt: string;
  updatedAt: string;
}

export const toRuleDto = (rule: CategoryRule): RuleDto => ({
  id: rule.id, field: rule.field, op: rule.op, pattern: rule.pattern, categoryId: rule.categoryId, accountId: rule.accountId,
  direction: rule.direction, amountMin: rule.amountMin, amountMax: rule.amountMax, renameMerchantTo: rule.renameMerchantTo,
  priority: rule.priority, source: rule.source, hitCount: rule.hitCount, createdAt: rule.createdAt.toISOString(), updatedAt: rule.updatedAt.toISOString(),
});

const notFound = () => new ApiError(404, "NOT_FOUND", "Правило не найдено");
// автоматика не трогает ручную разметку и переводы между счетами
const PROTECTED_SOURCES = ["manual", "transfer"];

/** Операция как вход правила: направление, модуль суммы, строки. */
const asInput = (row: Transaction): CategorizeInput => ({
  direction: row.type === "income" ? "in" : "out",
  amount: Math.abs(Number(row.amount)),
  merchant: row.merchant,
  description: row.description,
  mcc: row.mcc,
  accountId: row.accountId,
});

async function getOwnRule(userId: string, id: string): Promise<CategoryRule> {
  const [rule] = await db.select().from(categoryRules).where(and(eq(categoryRules.id, id), isNull(categoryRules.deletedAt)));
  if (!rule || rule.userId !== userId) throw notFound();
  return rule;
}

/** Категория видна пользователю, не перевод и подходит направлению правила; счёт — свой. */
async function validate(userId: string, input: { categoryId: string; direction?: string | null; accountId?: string | null; amountMin?: string | null; amountMax?: string | null }) {
  const category = await getVisible(db, userId, input.categoryId);
  if (category.kind === "transfer") throw new ApiError(400, "VALIDATION_ERROR", "Переводы между счетами правилами не размечаются");
  if (input.direction && category.kind !== (input.direction === "out" ? "expense" : "income")) {
    throw new ApiError(400, "VALIDATION_ERROR", "Категория не подходит направлению: списаниям — расходы, поступлениям — доходы");
  }
  if (input.accountId) {
    const [account] = await db.select({ id: accounts.id }).from(accounts).where(and(eq(accounts.id, input.accountId), eq(accounts.userId, userId)));
    if (!account) throw new ApiError(404, "NOT_FOUND", "Счёт не найден");
  }
  if (input.amountMin && input.amountMax && Number(input.amountMin) > Number(input.amountMax)) {
    throw new ApiError(400, "VALIDATION_ERROR", "Сумма «от» больше суммы «до»");
  }
  return category;
}

function normalizedPattern(field: string, pattern: string): string {
  const normalized = normalizeRulePattern(field, pattern);
  if (field === "mcc" ? !/^\d{4}$/.test(normalized) : normalized.length < 2) {
    throw new ApiError(400, "VALIDATION_ERROR", field === "mcc" ? "MCC — четыре цифры" : "Шаблон — хотя бы два символа");
  }
  return normalized;
}

/** Операции пользователя, которые правило может перекатегоризировать (без ручных и переводов), подходящие под условие. */
async function matchingTransactions(userId: string, rule: Parameters<typeof ruleMatches>[0], kind: string | null, exceptId?: string): Promise<Transaction[]> {
  const rows = await db.select().from(transactions).where(and(
    eq(transactions.userId, userId),
    isNull(transactions.deletedAt),
    inArray(transactions.type, kind === "income" ? ["income"] : kind === "expense" ? ["expense"] : ["expense", "income"]),
    notInArray(transactions.categorySource, PROTECTED_SOURCES),
    ...(rule.accountId ? [eq(transactions.accountId, rule.accountId)] : []),
  )).orderBy(desc(transactions.localDate), desc(transactions.id));
  return rows.filter((row) => row.id !== exceptId && ruleMatches(rule, asInput(row), row.merchantNormalized));
}

/** Применяет правило к прошлым операциям; возвращает число изменённых. */
export async function applyRuleToPast(userId: string, rule: CategoryRule, exceptId?: string): Promise<number> {
  const [category] = await db.select({ kind: categories.kind }).from(categories).where(eq(categories.id, rule.categoryId));
  const rows = (await matchingTransactions(userId, rule, category?.kind ?? null, exceptId))
    .filter((row) => row.categoryId !== rule.categoryId || row.categorySource !== "rule_user");
  for (let start = 0; start < rows.length; start += 500) {
    await db.update(transactions).set({
      categoryId: rule.categoryId,
      categorySource: "rule_user",
      categoryConfidence: 1,
      ...(rule.renameMerchantTo ? { merchantNormalized: rule.renameMerchantTo } : {}),
      updatedAt: new Date(),
    }).where(and(eq(transactions.userId, userId), inArray(transactions.id, rows.slice(start, start + 500).map((row) => row.id))));
  }
  if (rows.length) {
    await db.update(categoryRules).set({ hitCount: sql`${categoryRules.hitCount} + ${rows.length}` }).where(eq(categoryRules.id, rule.id));
  }
  return rows.length;
}

export async function listRules(userId: string, options: { limit: number; cursor?: string }): Promise<{ items: RuleDto[]; nextCursor: string | null }> {
  const offset = options.cursor ? Number.parseInt(Buffer.from(options.cursor, "base64url").toString(), 10) || 0 : 0;
  const rows = await db.select().from(categoryRules)
    .where(and(eq(categoryRules.userId, userId), isNull(categoryRules.deletedAt)))
    .orderBy(asc(categoryRules.priority), desc(categoryRules.createdAt), asc(categoryRules.id))
    .limit(options.limit + 1).offset(offset);
  const nextCursor = rows.length > options.limit ? Buffer.from(String(offset + options.limit)).toString("base64url") : null;
  return { items: rows.slice(0, options.limit).map(toRuleDto), nextCursor };
}

export async function createRule(userId: string, input: RuleInput, source: "manual" | "correction", apply: ApplyScope = "future")
  : Promise<{ rule: RuleDto; affectedCount: number }> {
  await validate(userId, input);
  const pattern = normalizedPattern(input.field, input.pattern);
  const values = {
    userId, field: input.field, op: input.op, pattern, categoryId: input.categoryId, accountId: input.accountId ?? null,
    direction: input.direction ?? null, amountMin: input.amountMin ?? null, amountMax: input.amountMax ?? null,
    renameMerchantTo: input.renameMerchantTo?.trim() || null, priority: input.priority ?? 100, source,
  };
  const [rule] = await db.insert(categoryRules).values(values).onConflictDoNothing().returning();
  if (!rule) throw new ApiError(409, "DUPLICATE_RESOURCE", "Такое правило уже есть");
  const affectedCount = apply === "future_and_past" ? await applyRuleToPast(userId, rule) : 0;
  return { rule: toRuleDto((await getOwnRule(userId, rule.id))), affectedCount };
}

export async function updateRule(userId: string, id: string, patch: Partial<RuleInput>, apply: ApplyScope = "future")
  : Promise<{ rule: RuleDto; affectedCount: number }> {
  const current = await getOwnRule(userId, id);
  const next = { ...current, ...Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)) } as CategoryRule;
  await validate(userId, next);
  const pattern = normalizedPattern(next.field, next.pattern);
  let rule: CategoryRule;
  try {
    [rule] = await db.update(categoryRules).set({
      field: next.field, op: next.op, pattern, categoryId: next.categoryId, accountId: next.accountId, direction: next.direction,
      amountMin: next.amountMin, amountMax: next.amountMax, renameMerchantTo: next.renameMerchantTo?.trim() || null,
      priority: next.priority, updatedAt: new Date(),
    }).where(eq(categoryRules.id, id)).returning();
  } catch (error: any) {
    if ((error?.cause?.code ?? error?.code) === "23505") throw new ApiError(409, "DUPLICATE_RESOURCE", "Такое правило уже есть");
    throw error;
  }
  const affectedCount = apply === "future_and_past" ? await applyRuleToPast(userId, rule) : 0;
  return { rule: toRuleDto(rule), affectedCount };
}

export async function deleteRule(userId: string, id: string): Promise<void> {
  await getOwnRule(userId, id);
  await db.update(categoryRules).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(categoryRules.id, id));
}

/** Сколько операций подпадает под условие (без ручных и переводов) и первые пять из них. */
export async function previewRule(userId: string, input: Pick<RuleInput, "field" | "op" | "pattern" | "accountId" | "direction">)
  : Promise<{ matchCount: number; sample: Transaction[] }> {
  const pattern = normalizedPattern(input.field, input.pattern);
  const kind = input.direction === "out" ? "expense" : input.direction === "in" ? "income" : null;
  const rows = await matchingTransactions(userId, {
    field: input.field, op: input.op, pattern, accountId: input.accountId ?? null, direction: input.direction ?? null, amountMin: null, amountMax: null,
  }, kind);
  return { matchCount: rows.length, sample: rows.slice(0, 5) };
}

/**
 * Условие правила из операции: мерчант — точное совпадение с узнанным или указанным мерчантом; иначе — описание
 * без номеров и шума («Перевод Иванов И.И.» → «перевод иванов»). null — правило строить не из чего.
 */
export function similarityOf(row: Transaction): { field: "merchant" | "description"; op: "equals" | "contains"; pattern: string; label: string } | null {
  const merchant = row.merchantNormalized || row.merchant;
  if (merchant && normalizeRulePattern("merchant", merchant).length >= 2) {
    return { field: "merchant", op: "equals", pattern: normalizeRulePattern("merchant", merchant), label: merchant };
  }
  const key = row.description ? merchantKey(row.description) : "";
  if (key.length >= 3) return { field: "description", op: "contains", pattern: key, label: row.description!.trim() };
  return null;
}

/** Похожие на операцию: условие будущего правила и число прошлых операций, которые оно изменит. */
export async function similarTransactions(userId: string, row: Transaction) {
  const similarity = row.type === "expense" || row.type === "income" ? similarityOf(row) : null;
  if (!similarity) return { similar: null, pastCount: 0 };
  const direction = row.type === "income" ? "in" : "out";
  const rows = await matchingTransactions(userId, { ...similarity, accountId: null, direction, amountMin: null, amountMax: null }, row.type, row.id);
  return { similar: { field: similarity.field, op: similarity.op, pattern: similarity.pattern, label: similarity.label }, pastCount: rows.length };
}

/**
 * Правило из исправления категории: повторное исправление того же мерчанта меняет категорию существующего
 * правила, а не создаёт второе. Возвращает правило, создано ли оно и сколько прошлых операций изменено.
 */
export async function ruleFromCorrection(userId: string, row: Transaction, categoryId: string, scope: ApplyScope)
  : Promise<{ rule: RuleDto; created: boolean; affectedCount: number } | null> {
  const similarity = similarityOf(row);
  if (!similarity) return null;
  const direction = row.type === "income" ? "in" : "out";
  await validate(userId, { categoryId, direction });
  const [existing] = await db.select().from(categoryRules).where(and(
    eq(categoryRules.userId, userId), eq(categoryRules.field, similarity.field), eq(categoryRules.op, similarity.op),
    eq(categoryRules.pattern, similarity.pattern), isNull(categoryRules.accountId), isNull(categoryRules.deletedAt),
  ));
  const rule = existing
    ? (await db.update(categoryRules).set({ categoryId, direction, updatedAt: new Date() }).where(eq(categoryRules.id, existing.id)).returning())[0]
    : (await db.insert(categoryRules).values({
      userId, field: similarity.field, op: similarity.op, pattern: similarity.pattern, categoryId, direction, source: "correction",
    }).returning())[0];
  const affectedCount = scope === "future_and_past" ? await applyRuleToPast(userId, rule, row.id) : 0;
  return { rule: toRuleDto(rule), created: !existing, affectedCount };
}
