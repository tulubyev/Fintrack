/**
 * Возвраты (E1.3): поступление в категории расходов — это возврат покупки. В итогах он уменьшает траты, а не
 * считается доходом; в конвейере «Возврат», «Отмена покупки», «Refund» получают категорию последней покупки
 * у того же мерчанта за 60 дней.
 */
import { and, desc, eq, gte, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { db, categories, transactions } from "@workspace/db";
import { merchantKey, normalizeMerchantText } from "./merchant";

/** SQL-условие «операция — возврат»: поступление в категории расходов. Для запросов FROM transactions. */
export const isRefundSql = sql`(${transactions.type} = 'income' AND EXISTS (
  SELECT 1 FROM ${categories} refund_category WHERE refund_category.id = ${transactions.categoryId} AND refund_category.kind = 'expense'
))`;

/** Доходы без возвратов и траты за вычетом возвратов — для sum(...) filter (where ...). */
export const incomeFilterSql = sql`(${transactions.type} = 'income' AND NOT ${isRefundSql})`;
export const expenseFilterSql = sql`(${transactions.type} = 'expense' OR ${isRefundSql})`;

const REFUND_WORDS = ["возврат", "отмена покупки", "отмена операции", "refund", "reversal", "chargeback"];
const REFUND_WINDOW_DAYS = 60;

/** Похоже ли описание поступления на возврат покупки. */
export function looksLikeRefund(...values: Array<string | null | undefined>): boolean {
  const text = ` ${normalizeMerchantText(values.filter(Boolean).join(" "))} `;
  return REFUND_WORDS.some((word) => text.includes(` ${word}`));
}

/** Ключ мерчанта без слов возврата: «Возврат ZARINA 1234» и «ZARINA 5678» — один мерчант. */
const refundKey = (value: string) => merchantKey(value).split(" ").filter((token) => !["возврат", "отмена", "покупки", "операции", "refund", "reversal", "chargeback", "за"].includes(token)).join(" ");

/**
 * Категория последней покупки у того же мерчанта за 60 дней до даты возврата (только категории расходов).
 * Тот же мерчант — совпал мерчант из словаря или строка без номеров, шума и слов возврата.
 */
export async function refundCategory(userId: string, input: { merchantNormalized: string | null; merchant?: string | null; description?: string | null; date?: string | null })
  : Promise<string | null> {
  const key = refundKey(input.merchant || input.description || "");
  if (!input.merchantNormalized && !key) return null;
  const to = input.date ?? new Date().toISOString().slice(0, 10);
  const from = new Date(new Date(`${to}T00:00:00Z`).getTime() - REFUND_WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);
  const rows = await db.select({ categoryId: transactions.categoryId, merchantNormalized: transactions.merchantNormalized, merchant: transactions.merchant, description: transactions.description })
    .from(transactions)
    .innerJoin(categories, and(eq(categories.id, transactions.categoryId), eq(categories.kind, "expense"), isNull(categories.deletedAt)))
    .where(and(
      eq(transactions.userId, userId), eq(transactions.type, "expense"), isNull(transactions.deletedAt), isNotNull(transactions.categoryId),
      gte(transactions.localDate, from), lte(transactions.localDate, to),
    ))
    .orderBy(desc(transactions.localDate), desc(transactions.createdAt))
    .limit(1000);
  const match = rows.find((row) =>
    (input.merchantNormalized && row.merchantNormalized === input.merchantNormalized)
    || (key && refundKey(row.merchant || row.description || "") === key));
  return match?.categoryId ?? null;
}
