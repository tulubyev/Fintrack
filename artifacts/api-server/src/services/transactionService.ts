/**
 * Операции и переводы (E1.1-T4/T5). Каждое изменение операций и пересчёт остатков затронутых счетов —
 * в одной транзакции БД. Чужая операция неотличима от несуществующей (404).
 */
import { randomUUID } from "node:crypto";
import { and, desc, eq, gte, ilike, inArray, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import { categories, fxRates, transactions, type Transaction } from "@shared/schema";
import { db } from "../db";
import { ApiError } from "../lib/apiError";
import { convertByRate, fromKopecks, toKopecks } from "../lib/money";
import { scheduleLlmCategorization } from "./categorization/llm";
import { expenseFilterSql, incomeFilterSql } from "./categorization/refund";
import { createCategorizer, recordRuleHits, type CategorizeResult } from "./categorization/pipeline";
import { getOwnAccount, recalcAccountBalance, toTransactionDto, type Executor, type TransactionDto } from "./ledgerService";

const MSK_OFFSET = "+03:00"; // часовой пояс пользователя пока один — Москва (users.timezone учтём с настройкой)

export interface TransactionFilters {
  accountIds?: string[];
  categoryIds?: string[];
  types?: string[];
  from?: string;
  to?: string;
  amountMin?: string;
  amountMax?: string;
  q?: string;
  sources?: string[];
  uncategorized?: boolean;
  recurringSeriesId?: string;
}

const notFound = () => new ApiError(404, "NOT_FOUND", "Операция не найдена");
const escapeLike = (value: string) => value.replace(/[\\%_]/g, "\\$&");

export async function filterConditions(userId: string, filters: TransactionFilters): Promise<SQL[]> {
  const conditions: SQL[] = [eq(transactions.userId, userId), isNull(transactions.deletedAt)];
  if (filters.accountIds?.length) conditions.push(inArray(transactions.accountId, filters.accountIds));
  if (filters.categoryIds?.length) {
    // фильтр по родителю включает его подкатегории
    const expanded = await db.select({ id: categories.id }).from(categories).where(and(
      or(inArray(categories.id, filters.categoryIds), inArray(categories.parentId, filters.categoryIds)),
      or(isNull(categories.userId), eq(categories.userId, userId)),
    ));
    conditions.push(expanded.length ? inArray(transactions.categoryId, expanded.map((row) => row.id)) : sql`false`);
  }
  if (filters.types?.length) conditions.push(inArray(transactions.type, filters.types));
  if (filters.from) conditions.push(gte(transactions.localDate, filters.from));
  if (filters.to) conditions.push(lte(transactions.localDate, filters.to));
  if (filters.amountMin) conditions.push(sql`abs(${transactions.amount}) >= ${filters.amountMin}::numeric`);
  if (filters.amountMax) conditions.push(sql`abs(${transactions.amount}) <= ${filters.amountMax}::numeric`);
  if (filters.q) {
    const pattern = `%${escapeLike(filters.q)}%`;
    conditions.push(or(ilike(transactions.merchant, pattern), ilike(transactions.description, pattern), ilike(transactions.note, pattern))!);
  }
  if (filters.sources?.length) conditions.push(inArray(transactions.source, filters.sources));
  if (filters.uncategorized) conditions.push(isNull(transactions.categoryId));
  if (filters.recurringSeriesId) conditions.push(eq(transactions.recurringSeriesId, filters.recurringSeriesId));
  return conditions;
}

// Курсор — позиция последней строки в порядке (local_date, created_at, id) по убыванию.
// created_at передаётся текстом с микросекундами: JS Date их теряет, и строки на границе пропадали бы.
const encodeCursor = (date: string, createdAt: string, id: string) => Buffer.from(JSON.stringify([date, createdAt, id])).toString("base64url");
function decodeCursor(cursor: string): [string, string, string] {
  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (Array.isArray(value) && value.length === 3 && value.every((part) => typeof part === "string")) return value as [string, string, string];
  } catch { /* ниже — общая ошибка */ }
  throw new ApiError(400, "VALIDATION_ERROR", "Некорректный курсор");
}

// NULLS LAST — как в индексе tx_user_date_idx: иначе PostgreSQL сортирует в памяти вместо чтения индекса по порядку
export const FEED_ORDER = [
  sql`${transactions.localDate} desc nulls last`,
  sql`${transactions.createdAt} desc nulls last`,
  sql`${transactions.id} desc nulls last`,
];

/** Для ног переводов — счёт второй ноги. */
async function counterparts(executor: Executor, rows: Transaction[]): Promise<Map<string, string>> {
  const groups = [...new Set(rows.map((row) => row.transferGroupId).filter((group): group is string => Boolean(group)))];
  if (!groups.length) return new Map();
  const legs = await executor.select({ id: transactions.id, accountId: transactions.accountId, group: transactions.transferGroupId })
    .from(transactions).where(and(inArray(transactions.transferGroupId, groups), isNull(transactions.deletedAt)));
  const result = new Map<string, string>();
  for (const row of rows) {
    const other = legs.find((leg) => leg.group === row.transferGroupId && leg.id !== row.id);
    if (other) result.set(row.id, other.accountId);
  }
  return result;
}

export async function toDtos(executor: Executor, rows: Transaction[]): Promise<TransactionDto[]> {
  const counterpartByRow = await counterparts(executor, rows);
  return rows.map((row) => toTransactionDto(row, counterpartByRow.get(row.id) ?? null));
}

export async function listTransactions(userId: string, filters: TransactionFilters, limit: number, cursor?: string) {
  const conditions = await filterConditions(userId, filters);
  if (cursor) {
    const [date, createdAt, id] = decodeCursor(cursor);
    conditions.push(sql`(${transactions.localDate}, ${transactions.createdAt}, ${transactions.id}) < (${date}::date, ${createdAt}::timestamptz, ${id}::uuid)`);
  }
  const rows = await db.select({
    row: transactions,
    createdAtText: sql<string>`to_char(${transactions.createdAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
  }).from(transactions).where(and(...conditions))
    .orderBy(...FEED_ORDER)
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return {
    items: await toDtos(db, page.map((item) => item.row)),
    nextCursor: rows.length > limit && last ? encodeCursor(last.row.localDate, last.createdAtText, last.row.id) : null,
  };
}

/** Итоги по фильтру в рублях: без переводов, корректировок и исключённых из статистики; возврат уменьшает траты. */
export async function summarizeTransactions(userId: string, filters: TransactionFilters) {
  const conditions = await filterConditions(userId, filters);
  conditions.push(inArray(transactions.type, ["income", "expense"]), eq(transactions.excludeFromStats, false), eq(transactions.status, "posted"));
  const [row] = await db.select({
    count: sql<number>`count(*)::int`,
    income: sql<string>`coalesce(sum(${transactions.amountRub}) filter (where ${incomeFilterSql}), 0)::text`,
    expense: sql<string>`coalesce(-sum(${transactions.amountRub}) filter (where ${expenseFilterSql}), 0)::text`,
  }).from(transactions).where(and(...conditions));
  const income = toKopecks(row.income);
  const expense = toKopecks(row.expense);
  return { count: row.count, income: fromKopecks(income), expense: fromKopecks(expense), net: fromKopecks(income - expense) };
}

export async function getOwnTransaction(executor: Executor, userId: string, id: string): Promise<Transaction> {
  const [row] = await executor.select().from(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.userId, userId), isNull(transactions.deletedAt)));
  if (!row) throw notFound();
  return row;
}

export async function getTransaction(userId: string, id: string): Promise<TransactionDto> {
  const [dto] = await toDtos(db, [await getOwnTransaction(db, userId, id)]);
  return dto;
}

/** Сумма в рублях: для валюты — по последнему курсу ЦБ не позже даты операции; нет курса — null (досчитает джоб курсов). */
async function toRub(executor: Executor, amount: string, currency: string, date: string): Promise<string | null> {
  if (currency === "RUB") return amount;
  const [rate] = await executor.select({ rate: fxRates.rateRub }).from(fxRates)
    .where(and(eq(fxRates.currency, currency), lte(fxRates.date, date))).orderBy(desc(fxRates.date)).limit(1);
  return rate ? fromKopecks(convertByRate(toKopecks(amount), rate.rate)) : null;
}

async function assertCategoryVisible(executor: Executor, userId: string, categoryId: string) {
  const [category] = await executor.select({ id: categories.id }).from(categories).where(and(
    eq(categories.id, categoryId), isNull(categories.deletedAt), or(isNull(categories.userId), eq(categories.userId, userId)),
  ));
  if (!category) throw new ApiError(400, "VALIDATION_ERROR", "Категория не найдена");
}

async function categoryIdByCode(executor: Executor, code: string): Promise<string | null> {
  const [category] = await executor.select({ id: categories.id }).from(categories).where(eq(categories.code, code));
  return category?.id ?? null;
}

const momentOf = (date: string, time?: string | null) => new Date(`${date}T${time ?? "12:00"}:00${MSK_OFFSET}`);

async function assertWritableAccount(executor: Executor, userId: string, accountId: string) {
  const account = await getOwnAccount(executor, userId, accountId);
  if (account.archivedAt) throw new ApiError(409, "ACCOUNT_ARCHIVED", "Счёт в архиве: операции в нём не создаются");
  return account;
}

export interface TransactionInput {
  id?: string;
  accountId: string;
  type: "expense" | "income";
  amount: string; // > 0, знак задаёт type
  currency?: string;
  date: string;
  time?: string | null;
  categoryId?: string | null;
  merchant?: string | null;
  description?: string | null;
  note?: string | null;
  excludeFromStats?: boolean;
}

/** Создаёт операцию вручную. Повтор с тем же id и теми же данными возвращает существующую (created=false). */
export async function createTransaction(userId: string, input: TransactionInput): Promise<{ transaction: TransactionDto; created: boolean }> {
  const signed = fromKopecks(input.type === "expense" ? -toKopecks(input.amount) : toKopecks(input.amount));
  const result = await db.transaction(async (tx) => {
    if (input.id) {
      const [existing] = await tx.select().from(transactions).where(eq(transactions.id, input.id));
      const same = existing && existing.userId === userId && !existing.deletedAt && existing.accountId === input.accountId
        && existing.type === input.type && existing.amount === signed && existing.localDate === input.date;
      if (same) return { row: existing, created: false, ruleId: null };
      if (existing) throw new ApiError(409, "DUPLICATE_RESOURCE", "Операция с таким id уже существует");
    }
    const account = await assertWritableAccount(tx, userId, input.accountId);
    const currency = account.currency ?? "RUB";
    if (input.currency && input.currency !== currency) {
      throw new ApiError(400, "VALIDATION_ERROR", "Валюта операции должна совпадать с валютой счёта");
    }
    if (input.categoryId) await assertCategoryVisible(tx, userId, input.categoryId);
    const amountRub = await toRub(tx, signed, currency, input.date);
    // категорию не выбрали — её подбирает конвейер (E1.3-T6)
    const auto: CategorizeResult | null = input.categoryId ? null : await (await createCategorizer(userId))({
      direction: input.type === "expense" ? "out" : "in",
      amount: Math.abs(Number(signed)),
      amountRub: amountRub === null ? null : Math.abs(Number(amountRub)),
      merchant: input.merchant,
      description: input.description,
      institutionCode: account.institutionCode,
      accountId: account.id,
      date: input.date,
    });
    const [row] = await tx.insert(transactions).values({
      ...(input.id ? { id: input.id } : {}),
      userId,
      accountId: account.id,
      type: input.type,
      amount: signed,
      currency,
      amountRub,
      localDate: input.date,
      transactionDate: momentOf(input.date, input.time),
      hasTime: Boolean(input.time),
      categoryId: input.categoryId ?? auto?.categoryId ?? null,
      categorySource: auto?.source ?? "manual",
      categoryConfidence: auto?.confidence ?? null,
      merchant: input.merchant ?? null,
      merchantNormalized: auto?.merchantNormalized ?? null,
      description: input.description ?? input.merchant ?? "",
      note: input.note ?? null,
      excludeFromStats: input.excludeFromStats ?? false,
      source: "manual",
    }).returning();
    await recalcAccountBalance(tx, account.id);
    return { row, created: true, ruleId: auto?.ruleId ?? null };
  });
  await recordRuleHits([result.ruleId]);
  // конвейер не узнал операцию — шаг 7, нейросеть (если включена)
  if (result.created && result.row.categorySource === "none") await scheduleLlmCategorization(userId, [result.row.id]);
  return { transaction: (await toDtos(db, [result.row]))[0], created: result.created };
}

export interface TransactionPatch {
  categoryId?: string | null;
  merchant?: string | null;
  note?: string | null;
  excludeFromStats?: boolean;
  amount?: string;
  date?: string;
  time?: string | null;
  type?: "expense" | "income";
  accountId?: string;
}

const MANUAL_ONLY_FIELDS = ["amount", "date", "time", "type", "accountId"] as const;

/** Категорию, мерчанта, заметку и статистику можно менять у любой операции; сумму, дату, тип и счёт — только у ручной. */
export async function updateTransaction(userId: string, id: string, patch: TransactionPatch): Promise<TransactionDto> {
  const row = await db.transaction(async (tx) => {
    const current = await getOwnTransaction(tx, userId, id);
    const changesCore = MANUAL_ONLY_FIELDS.some((field) => patch[field] !== undefined);
    if (changesCore && (current.source !== "manual" || current.type === "transfer" || current.type === "adjustment")) {
      throw new ApiError(409, "OPERATION_NOT_ALLOWED", "Сумму, дату, тип и счёт можно менять только у ручных расходов и доходов");
    }
    if (patch.categoryId) await assertCategoryVisible(tx, userId, patch.categoryId);

    const accountId = patch.accountId ?? current.accountId;
    if (patch.accountId && patch.accountId !== current.accountId) {
      const target = await assertWritableAccount(tx, userId, patch.accountId);
      if ((target.currency ?? "RUB") !== (current.currency ?? "RUB")) {
        throw new ApiError(409, "OPERATION_NOT_ALLOWED", "Перенести операцию можно только в счёт той же валюты");
      }
    }
    const type = patch.type ?? (current.type as "expense" | "income");
    const absolute = patch.amount !== undefined ? toKopecks(patch.amount) : (toKopecks(current.amount) < 0n ? -toKopecks(current.amount) : toKopecks(current.amount));
    const amount = fromKopecks(type === "expense" ? -absolute : absolute);
    const date = patch.date ?? current.localDate;
    const currentTime = current.hasTime ? toTransactionDto(current).time : null;
    const time = patch.time !== undefined ? patch.time : currentTime;

    const [updated] = await tx.update(transactions).set({
      ...(patch.categoryId !== undefined ? { categoryId: patch.categoryId, categorySource: patch.categoryId ? "manual" : "none" } : {}),
      ...(patch.merchant !== undefined ? { merchant: patch.merchant } : {}),
      ...(patch.note !== undefined ? { note: patch.note } : {}),
      ...(patch.excludeFromStats !== undefined ? { excludeFromStats: patch.excludeFromStats } : {}),
      ...(changesCore ? {
        accountId,
        type,
        amount,
        amountRub: await toRub(tx, amount, current.currency ?? "RUB", date),
        localDate: date,
        transactionDate: momentOf(date, time),
        hasTime: Boolean(time),
      } : {}),
      updatedAt: new Date(),
    }).where(eq(transactions.id, id)).returning();
    if (changesCore) {
      await recalcAccountBalance(tx, current.accountId);
      if (accountId !== current.accountId) await recalcAccountBalance(tx, accountId);
    }
    return updated;
  });
  return (await toDtos(db, [row]))[0];
}

/** Мягко удаляет операции (у переводов — обе ноги) и пересчитывает затронутые счета. */
async function softDelete(executor: Executor, userId: string, rows: Transaction[]): Promise<number> {
  const ids = rows.map((row) => row.id);
  const groups = [...new Set(rows.map((row) => row.transferGroupId).filter((group): group is string => Boolean(group)))];
  const now = new Date();
  const deleted = await executor.update(transactions).set({ deletedAt: now, updatedAt: now }).where(and(
    eq(transactions.userId, userId),
    isNull(transactions.deletedAt),
    groups.length ? or(inArray(transactions.id, ids), inArray(transactions.transferGroupId, groups)) : inArray(transactions.id, ids),
  )).returning({ accountId: transactions.accountId });
  for (const accountId of new Set(deleted.map((row) => row.accountId))) await recalcAccountBalance(executor, accountId);
  return deleted.length;
}

export async function deleteTransaction(userId: string, id: string): Promise<Transaction> {
  return db.transaction(async (tx) => {
    const row = await getOwnTransaction(tx, userId, id);
    await softDelete(tx, userId, [row]);
    return row;
  });
}

/** Массовое действие над своими операциями: если хоть одна чужая или удалена — 404 и ничего не меняется. */
export async function bulkUpdate(userId: string, ids: string[], action: "set_category" | "delete" | "exclude" | "include", categoryId?: string): Promise<number> {
  return db.transaction(async (tx) => {
    const unique = [...new Set(ids)];
    const rows = await tx.select().from(transactions)
      .where(and(inArray(transactions.id, unique), eq(transactions.userId, userId), isNull(transactions.deletedAt)));
    if (rows.length !== unique.length) throw notFound();
    if (action === "delete") return softDelete(tx, userId, rows);
    if (action === "set_category") await assertCategoryVisible(tx, userId, categoryId!);
    const updated = await tx.update(transactions).set({
      ...(action === "set_category" ? { categoryId, categorySource: "manual" } : { excludeFromStats: action === "exclude" }),
      updatedAt: new Date(),
    }).where(inArray(transactions.id, unique)).returning({ id: transactions.id });
    return updated.length;
  });
}

// ─── Переводы между своими счетами ─────────────────────────────────────────

export interface TransferInput {
  id?: string;
  fromAccountId: string;
  toAccountId: string;
  amount: string;
  toAmount?: string;
  date: string;
  note?: string | null;
}

async function transferLegs(executor: Executor, userId: string, groupId: string) {
  const legs = await executor.select().from(transactions).where(and(
    eq(transactions.transferGroupId, groupId), eq(transactions.userId, userId), isNull(transactions.deletedAt),
  ));
  const from = legs.find((leg) => toKopecks(leg.amount) < 0n);
  const to = legs.find((leg) => toKopecks(leg.amount) > 0n);
  return { legs, from, to };
}

/** Перевод — две операции type=transfer с общим transfer_group_id: в доходы и расходы он не попадает. */
export async function createTransfer(userId: string, input: TransferInput) {
  if (input.fromAccountId === input.toAccountId) throw new ApiError(400, "VALIDATION_ERROR", "Счета перевода должны различаться");
  const groupId = input.id ?? randomUUID();
  const result = await db.transaction(async (tx) => {
    if (input.id) {
      const existing = await tx.select({ userId: transactions.userId }).from(transactions).where(eq(transactions.transferGroupId, input.id)).limit(1);
      if (existing.length) {
        if (existing[0].userId !== userId) throw new ApiError(409, "DUPLICATE_RESOURCE", "Перевод с таким id уже существует");
        const { from, to } = await transferLegs(tx, userId, input.id);
        if (from && to) return { from, to, created: false };
        throw new ApiError(409, "DUPLICATE_RESOURCE", "Перевод с таким id уже существует");
      }
    }
    const fromAccount = await assertWritableAccount(tx, userId, input.fromAccountId);
    const toAccount = await assertWritableAccount(tx, userId, input.toAccountId);
    const fromCurrency = fromAccount.currency ?? "RUB";
    const toCurrency = toAccount.currency ?? "RUB";
    if (fromCurrency !== toCurrency && !input.toAmount) {
      throw new ApiError(400, "VALIDATION_ERROR", "Для перевода между валютами укажите сумму зачисления (toAmount)");
    }
    const outgoing = fromKopecks(-toKopecks(input.amount));
    const incoming = fromCurrency === toCurrency ? input.amount : input.toAmount!;
    const categoryId = await categoryIdByCode(tx, "xfer.own");
    const common = {
      userId,
      type: "transfer",
      transferGroupId: groupId,
      localDate: input.date,
      transactionDate: momentOf(input.date),
      hasTime: false,
      categoryId,
      categorySource: "transfer",
      description: "Перевод между своими счетами",
      note: input.note ?? null,
      source: "manual",
    };
    const [from] = await tx.insert(transactions).values({
      ...common, accountId: fromAccount.id, amount: outgoing, currency: fromCurrency, amountRub: await toRub(tx, outgoing, fromCurrency, input.date),
    }).returning();
    const [to] = await tx.insert(transactions).values({
      ...common, accountId: toAccount.id, amount: incoming, currency: toCurrency, amountRub: await toRub(tx, incoming, toCurrency, input.date),
    }).returning();
    await recalcAccountBalance(tx, fromAccount.id);
    await recalcAccountBalance(tx, toAccount.id);
    return { from, to, created: true };
  });
  return {
    created: result.created,
    transferGroupId: groupId,
    from: toTransactionDto(result.from, result.to.accountId),
    to: toTransactionDto(result.to, result.from.accountId),
    sameCurrency: (result.from.currency ?? "RUB") === (result.to.currency ?? "RUB"),
  };
}

/** Связывает расход и доход в разных своих счетах в перевод (суммы не меняются, остатки тоже). */
export async function linkTransfer(userId: string, outgoingId: string, incomingId: string): Promise<string> {
  return db.transaction(async (tx) => {
    const outgoing = await getOwnTransaction(tx, userId, outgoingId);
    const incoming = await getOwnTransaction(tx, userId, incomingId);
    if (outgoing.transferGroupId || incoming.transferGroupId) throw new ApiError(409, "OPERATION_NOT_ALLOWED", "Операция уже входит в перевод");
    if (outgoing.type !== "expense" || incoming.type !== "income") throw new ApiError(409, "OPERATION_NOT_ALLOWED", "Перевод связывает расход и доход");
    if (outgoing.accountId === incoming.accountId) throw new ApiError(409, "OPERATION_NOT_ALLOWED", "Операции в одном счёте нельзя связать в перевод");
    const groupId = randomUUID();
    await tx.update(transactions).set({
      type: "transfer", transferGroupId: groupId, categoryId: await categoryIdByCode(tx, "xfer.own"), categorySource: "transfer", updatedAt: new Date(),
    }).where(inArray(transactions.id, [outgoing.id, incoming.id]));
    return groupId;
  });
}

/** Разрывает перевод: keepTransactions — ноги становятся расходом и доходом, иначе удаляются обе. */
export async function unlinkTransfer(userId: string, groupId: string, keepTransactions: boolean): Promise<void> {
  await db.transaction(async (tx) => {
    const { legs } = await transferLegs(tx, userId, groupId);
    if (!legs.length) throw new ApiError(404, "NOT_FOUND", "Перевод не найден");
    if (!keepTransactions) {
      await softDelete(tx, userId, legs);
      return;
    }
    for (const leg of legs) {
      await tx.update(transactions).set({
        type: toKopecks(leg.amount) < 0n ? "expense" : "income",
        transferGroupId: null, categoryId: null, categorySource: "none", updatedAt: new Date(),
      }).where(eq(transactions.id, leg.id));
    }
  });
}

const TRANSFER_HINTS = ["перевод", "между своими", "с карты на карту"];

/**
 * Пары «расход в одном счёте — такой же доход в другом» за 90 дней с разницей дат до 2 дней,
 * если в описании есть «перевод», «между своими», «с карты на карту» или последние 4 цифры своей карты.
 */
export async function transferSuggestions(userId: string) {
  const { rows } = await db.execute<{ outgoing_id: string; incoming_id: string; days: number }>(sql`
    SELECT o.id AS outgoing_id, i.id AS incoming_id, abs(i.local_date - o.local_date) AS days
    FROM transactions o
    JOIN transactions i ON i.user_id = o.user_id AND i.account_id <> o.account_id
      AND i.amount = -o.amount AND coalesce(i.currency, 'RUB') = coalesce(o.currency, 'RUB')
      AND abs(i.local_date - o.local_date) <= 2
    JOIN accounts oa ON oa.id = o.account_id
    JOIN accounts ia ON ia.id = i.account_id
    WHERE o.user_id = ${userId} AND o.type = 'expense' AND i.type = 'income'
      AND o.transfer_group_id IS NULL AND i.transfer_group_id IS NULL
      AND o.deleted_at IS NULL AND i.deleted_at IS NULL
      AND o.local_date >= current_date - 90
      AND (
        ${or(...TRANSFER_HINTS.flatMap((hint) => [sql`o.description ILIKE ${`%${hint}%`}`, sql`i.description ILIKE ${`%${hint}%`}`]))}
        OR (ia.last_four IS NOT NULL AND o.description LIKE '%' || ia.last_four || '%')
        OR (oa.last_four IS NOT NULL AND i.description LIKE '%' || oa.last_four || '%')
      )
    ORDER BY o.local_date DESC
    LIMIT 50
  `);
  if (!rows.length) return [];
  const ids = rows.flatMap((row) => [row.outgoing_id, row.incoming_id]);
  const byId = new Map((await db.select().from(transactions).where(inArray(transactions.id, ids))).map((row) => [row.id, row]));
  return rows.map((row) => ({
    outgoing: toTransactionDto(byId.get(row.outgoing_id)!),
    incoming: toTransactionDto(byId.get(row.incoming_id)!),
    score: Math.round((1 - Number(row.days) * 0.15) * 100) / 100, // та же дата — 1, разница в 2 дня — 0,7
  }));
}
