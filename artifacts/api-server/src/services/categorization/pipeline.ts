/**
 * Конвейер автокатегоризации (E1.3-T6). Порядок источников, первое совпадение выигрывает:
 * перевод между счетами → возврат покупки → правила пользователя → словарь мерчантов → MCC → категория банка →
 * ключевые слова → без категории.
 * MCC с двойным смыслом (уверенность < 0,5) уступает категории банка и ключевым словам. Категория должна подходить
 * по виду: списание — расходы, поступление — доходы (возвраты — отдельный шаг). Скрытая пользователем системная
 * категория заменяется родителем, если тот не скрыт. Ручную разметку (category_source = 'manual') конвейер не трогает —
 * за этим следит вызывающий код.
 */
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { db, categories, categoryRules, userCategoryPrefs } from "@workspace/db";
import { keywordCategory } from "./keywords";
import { matchMerchant, normalizeMerchantText } from "./merchant";
import { looksLikeRefund, refundCategory } from "./refund";
import { bankCategory, mccCategory } from "./reference";

export type CategorySource = "manual" | "rule_user" | "merchant" | "mcc" | "bank" | "keyword" | "llm" | "transfer" | "none";

export interface CategorizeInput {
  direction: "in" | "out";
  /** Модуль суммы операции. */
  amount: number;
  /** Модуль суммы в рублях, если известен (MCC 4112: электричка или поезд). */
  amountRub?: number | null;
  merchant?: string | null;
  description?: string | null;
  mcc?: string | null;
  bankCategory?: string | null;
  institutionCode?: string | null;
  accountId?: string | null;
  transferGroupId?: string | null;
  /** Дата операции (ГГГГ-ММ-ДД): возврат ищет покупку за 60 дней до неё. */
  date?: string | null;
}

export interface CategorizeResult {
  categoryId: string | null;
  source: CategorySource;
  confidence: number | null;
  merchantNormalized: string | null;
  /** Сработавшее правило пользователя — для счётчика hit_count. */
  ruleId: string | null;
}

const CONFIDENCE = { transfer: 1, rule_user: 1, merchant: 0.9, bank: 0.8, refund: 0.8, keyword: 0.6 } as const;
const AMBIGUOUS_MCC = 0.5;

type Rule = typeof categoryRules.$inferSelect & { categoryKind: string };
type RuleCondition = Pick<typeof categoryRules.$inferSelect, "field" | "op" | "pattern" | "direction" | "accountId" | "amountMin" | "amountMax">;

/** Шаблон правила в том виде, в каком он хранится: MCC — как есть, текст — нормализованным, без знаков препинания. */
export function normalizeRulePattern(field: string, pattern: string): string {
  return field === "mcc" ? pattern.trim() : normalizeMerchantText(pattern);
}

/** Подходит ли операция под условие правила; merchantName — мерчант из словаря, если узнан. */
export function ruleMatches(rule: RuleCondition, input: CategorizeInput, merchantName: string | null): boolean {
  if (rule.direction && rule.direction !== input.direction) return false;
  if (rule.accountId && rule.accountId !== input.accountId) return false;
  if (rule.amountMin !== null && input.amount < Number(rule.amountMin)) return false;
  if (rule.amountMax !== null && input.amount > Number(rule.amountMax)) return false;
  const raw = rule.field === "merchant" ? merchantName ?? input.merchant : rule.field === "description" ? input.description : input.mcc;
  if (!raw) return false;
  const value = normalizeRulePattern(rule.field, raw);
  if (rule.op === "equals") return value === rule.pattern;
  if (rule.op === "starts_with") return value.startsWith(rule.pattern);
  return value.includes(rule.pattern);
}

/**
 * Системные категории по коду с учётом вида и скрытых пользователем: скрытая заменяется родителем, если тот виден;
 * resolve вернёт null, если категория не подходит.
 */
export async function loadCategoryResolver(userId: string) {
  const [system, hiddenRows] = await Promise.all([
    db.select({ id: categories.id, code: categories.code, kind: categories.kind, parentId: categories.parentId })
      .from(categories).where(and(isNull(categories.userId), isNull(categories.deletedAt))),
    db.select({ categoryId: userCategoryPrefs.categoryId }).from(userCategoryPrefs)
      .where(and(eq(userCategoryPrefs.userId, userId), eq(userCategoryPrefs.hidden, true))),
  ]);
  const byCode = new Map(system.map((c) => [c.code!, c]));
  const byId = new Map(system.map((c) => [c.id, c]));
  const hidden = new Set(hiddenRows.map((row) => row.categoryId));
  const resolve = (code: string | null | undefined, kind: string): string | null => {
    const category = code ? byCode.get(code) : undefined;
    if (!category || category.kind !== kind) return null;
    if (!hidden.has(category.id)) return category.id;
    const parent = category.parentId ? byId.get(category.parentId) : undefined;
    return parent && !hidden.has(parent.id) ? parent.id : null;
  };
  return { resolve, idOf: (code: string) => byCode.get(code)?.id ?? null, codes: system };
}

/**
 * Готовит категоризацию для пользователя: справочник категорий, скрытые категории и правила читаются один раз —
 * так пачка операций импорта не ходит в базу за каждой строкой.
 */
export async function createCategorizer(userId: string): Promise<(input: CategorizeInput) => Promise<CategorizeResult>> {
  const [{ resolve, idOf }, rules] = await Promise.all([
    loadCategoryResolver(userId),
    db.select({ rule: categoryRules, categoryKind: categories.kind }).from(categoryRules)
      .innerJoin(categories, and(eq(categories.id, categoryRules.categoryId), isNull(categories.deletedAt)))
      .where(and(eq(categoryRules.userId, userId), isNull(categoryRules.deletedAt)))
      .orderBy(asc(categoryRules.priority), desc(categoryRules.createdAt)),
  ]);
  const userRules: Rule[] = rules.map((row) => ({ ...row.rule, categoryKind: row.categoryKind }));

  return async (input) => {
    const kind = input.direction === "out" ? "expense" : "income";
    const merchant = await matchMerchant(input.merchant, input.description);
    let merchantNormalized = merchant?.merchantName ?? null;
    const result = (categoryId: string | null, source: CategorySource, confidence: number | null, ruleId: string | null = null): CategorizeResult =>
      ({ categoryId, source, confidence, merchantNormalized, ruleId });

    if (input.transferGroupId) return result(idOf("xfer.own"), "transfer", CONFIDENCE.transfer);

    // «Возврат», «Отмена покупки» — категория последней покупки у того же мерчанта: в итогах возврат уменьшит её траты
    if (input.direction === "in" && looksLikeRefund(input.merchant, input.description)) {
      const refunded = await refundCategory(userId, { merchantNormalized, merchant: input.merchant, description: input.description, date: input.date });
      if (refunded) return result(refunded, "keyword", CONFIDENCE.refund);
    }

    const rule = userRules.find((candidate) => candidate.categoryKind === kind && ruleMatches(candidate, input, merchantNormalized));
    if (rule) {
      merchantNormalized = rule.renameMerchantTo ?? merchantNormalized;
      return result(rule.categoryId, "rule_user", CONFIDENCE.rule_user, rule.id);
    }

    const byMerchant = resolve(merchant?.categoryCode, kind);
    if (byMerchant) return result(byMerchant, "merchant", CONFIDENCE.merchant);

    const mcc = await mccCategory(input.mcc, input.amountRub ?? undefined);
    const byMcc = resolve(mcc?.categoryCode, kind);
    if (byMcc && mcc!.confidence >= AMBIGUOUS_MCC) return result(byMcc, "mcc", mcc!.confidence);

    const bank = await bankCategory(input.institutionCode, input.bankCategory, input.direction);
    const byBank = resolve(bank?.categoryCode, kind);
    if (byBank) return result(byBank, "bank", bank!.confidence);

    const byKeyword = resolve(keywordCategory(input.direction, input.merchant, input.description), kind);
    if (byKeyword) return result(byKeyword, "keyword", CONFIDENCE.keyword);

    if (byMcc) return result(byMcc, "mcc", mcc!.confidence);
    return result(null, "none", null);
  };
}

/** Увеличивает счётчики срабатываний правил (повторы одного правила складываются). */
export async function recordRuleHits(ruleIds: Array<string | null>): Promise<void> {
  const counts = new Map<string, number>();
  for (const id of ruleIds) if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
  for (const [id, count] of counts) {
    await db.update(categoryRules).set({ hitCount: sql`${categoryRules.hitCount} + ${count}` }).where(eq(categoryRules.id, id));
  }
}
