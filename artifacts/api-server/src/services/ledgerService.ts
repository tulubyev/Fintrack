/**
 * Счета и операции (E1.1): остатки, корректировки, удаление. Всё, что меняет операции, идёт в db.transaction()
 * вместе с пересчётом остатка, чтобы balance никогда не расходился с операциями.
 *
 * Остаток счёта = opening_balance + сумма amount проведённых (posted) неудалённых операций
 * с local_date >= opening_balance_date (если дата задана).
 */
import { and, desc, eq, inArray, isNull, max, sql } from "drizzle-orm";
import { accounts, fxRates, transactions, type Account, type Transaction } from "@shared/schema";
import { db } from "../db";
import { ApiError } from "../lib/apiError";
import { convertByRate, fromKopecks, toKopecks } from "../lib/money";

export type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface AccountInput {
  name: string;
  kind: string;
  institutionCode?: string | null;
  currency?: string;
  openingBalance?: string;
  openingBalanceDate?: string | null;
  lastFour?: string | null;
  creditLimit?: string | null;
  includeInTotal?: boolean;
  color?: string | null;
  icon?: string | null;
  sortOrder?: number;
}

export interface AccountDto {
  id: string;
  name: string;
  kind: string;
  institutionCode: string | null;
  currency: string;
  balance: string;
  balanceRub: string | null;
  openingBalance: string;
  openingBalanceDate: string | null;
  lastFour: string | null;
  creditLimit: string | null;
  includeInTotal: boolean;
  color: string | null;
  icon: string | null;
  sortOrder: number;
  source: string;
  archivedAt: Date | null;
  lastTransactionDate: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TransactionDto {
  id: string;
  accountId: string;
  type: string;
  status: string;
  amount: string;
  currency: string;
  amountRub: string | null;
  originalAmount: string | null;
  originalCurrency: string | null;
  date: string;
  time: string | null;
  categoryId: string | null;
  categorySource: string;
  merchant: string | null;
  description: string;
  note: string | null;
  mcc: string | null;
  transferGroupId: string | null;
  transferCounterpartAccountId: string | null;
  source: string;
  importBatchId: string | null;
  recurringSeriesId: string | null;
  excludeFromStats: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const TIMEZONE = "Europe/Moscow"; // пока у всех пользователей; users.timezone начнёт учитываться вместе с настройкой

/** counterpartAccountId — счёт второй ноги перевода (известен вызывающему, который загрузил обе ноги). */
export function toTransactionDto(row: Transaction, counterpartAccountId: string | null = null): TransactionDto {
  const time = row.hasTime
    ? new Intl.DateTimeFormat("ru-RU", { timeZone: TIMEZONE, hour: "2-digit", minute: "2-digit", hour12: false }).format(row.transactionDate)
    : null;
  return {
    id: row.id,
    accountId: row.accountId,
    type: row.type,
    status: row.status,
    amount: row.amount,
    currency: row.currency ?? "RUB",
    amountRub: row.amountRub,
    originalAmount: row.originalAmount,
    originalCurrency: row.originalCurrency,
    date: row.localDate,
    time,
    categoryId: row.categoryId,
    categorySource: row.categorySource,
    merchant: row.merchant,
    description: row.description,
    note: row.note,
    mcc: row.mcc,
    transferGroupId: row.transferGroupId,
    transferCounterpartAccountId: counterpartAccountId,
    source: row.source,
    importBatchId: row.importBatchId,
    recurringSeriesId: row.recurringSeriesId,
    excludeFromStats: row.excludeFromStats,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Последний известный курс каждой валюты (рублей за единицу). */
export async function latestRates(currencies: string[]): Promise<Map<string, string>> {
  const foreign = [...new Set(currencies.filter((currency) => currency !== "RUB"))];
  if (!foreign.length) return new Map();
  const rows = await db
    .selectDistinctOn([fxRates.currency], { currency: fxRates.currency, rate: fxRates.rateRub })
    .from(fxRates)
    .where(inArray(fxRates.currency, foreign))
    .orderBy(fxRates.currency, desc(fxRates.date));
  return new Map(rows.map((row) => [row.currency, row.rate]));
}

function balanceRub(account: Account, rates: Map<string, string>): string | null {
  const currency = account.currency ?? "RUB";
  if (currency === "RUB") return account.balance;
  const rate = rates.get(currency);
  return rate ? fromKopecks(convertByRate(toKopecks(account.balance), rate)) : null;
}

export async function toAccountDtos(rows: Account[]): Promise<AccountDto[]> {
  if (!rows.length) return [];
  const [rates, lastDates] = await Promise.all([
    latestRates(rows.map((row) => row.currency ?? "RUB")),
    db.select({ accountId: transactions.accountId, last: max(transactions.localDate) })
      .from(transactions)
      .where(and(inArray(transactions.accountId, rows.map((row) => row.id)), isNull(transactions.deletedAt)))
      .groupBy(transactions.accountId),
  ]);
  const lastByAccount = new Map(lastDates.map((row) => [row.accountId, row.last]));
  return rows.map((row) => ({
    id: row.id,
    name: row.accountName,
    kind: row.kind,
    institutionCode: row.institutionCode,
    currency: row.currency ?? "RUB",
    balance: row.balance,
    balanceRub: balanceRub(row, rates),
    openingBalance: row.openingBalance,
    openingBalanceDate: row.openingBalanceDate,
    lastFour: row.lastFour,
    creditLimit: row.creditLimit,
    includeInTotal: row.includeInTotal,
    color: row.color,
    icon: row.icon,
    sortOrder: row.sortOrder,
    source: row.source,
    archivedAt: row.archivedAt,
    lastTransactionDate: lastByAccount.get(row.id) ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

/** Пересчитывает кеш остатка из операций. Вызывается в той же транзакции, что и изменение операций. */
export async function recalcAccountBalance(executor: Executor, accountId: string): Promise<void> {
  await executor.update(accounts).set({
    balance: sql`opening_balance + coalesce((
      SELECT sum(t.amount) FROM transactions t
      WHERE t.account_id = accounts.id AND t.deleted_at IS NULL AND t.status = 'posted'
        AND (accounts.opening_balance_date IS NULL OR t.local_date >= accounts.opening_balance_date)
    ), 0)`,
    updatedAt: new Date(),
  }).where(eq(accounts.id, accountId));
}

/** Счёт пользователя или 404: чужой счёт неотличим от несуществующего. */
export async function getOwnAccount(executor: Executor, userId: string, accountId: string): Promise<Account> {
  const [account] = await executor.select().from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.userId, userId), isNull(accounts.deletedAt)));
  if (!account) throw new ApiError(404, "NOT_FOUND", "Счёт не найден");
  return account;
}

export async function listAccounts(userId: string, includeArchived: boolean) {
  const rows = await db.select().from(accounts)
    .where(and(eq(accounts.userId, userId), isNull(accounts.deletedAt), includeArchived ? undefined : isNull(accounts.archivedAt)))
    .orderBy(accounts.sortOrder, accounts.createdAt)
    .limit(100);
  const items = await toAccountDtos(rows);

  // Итог — по счетам «в общем балансе», без архивных
  const counted = items.filter((item) => item.includeInTotal && !item.archivedAt);
  const byCurrency = new Map<string, bigint>();
  let totalRub = 0n;
  const currenciesWithoutRate = new Set<string>();
  for (const item of counted) {
    byCurrency.set(item.currency, (byCurrency.get(item.currency) ?? 0n) + toKopecks(item.balance));
    if (item.balanceRub === null) currenciesWithoutRate.add(item.currency);
    else totalRub += toKopecks(item.balanceRub);
  }
  return {
    items,
    totals: {
      balanceRub: fromKopecks(totalRub),
      byCurrency: [...byCurrency].map(([currency, kopecks]) => ({ currency, balance: fromKopecks(kopecks) })),
      currenciesWithoutRate: [...currenciesWithoutRate], // курса ЦБ ещё нет — такие счета в balanceRub не вошли
    },
  };
}

export async function getAccount(userId: string, accountId: string): Promise<AccountDto> {
  const [dto] = await toAccountDtos([await getOwnAccount(db, userId, accountId)]);
  return dto;
}

/** Создаёт счёт. Повтор с тем же id у того же пользователя возвращает существующий (created=false). */
export async function createAccount(userId: string, input: AccountInput & { id?: string }): Promise<{ account: AccountDto; created: boolean }> {
  if (input.id) {
    const [existing] = await db.select().from(accounts).where(eq(accounts.id, input.id));
    if (existing && existing.userId === userId && !existing.deletedAt) return { account: (await toAccountDtos([existing]))[0], created: false };
    if (existing) throw new ApiError(409, "DUPLICATE_RESOURCE", "Счёт с таким id уже существует");
  }
  const openingBalance = input.openingBalance ?? "0.00";
  const [row] = await db.insert(accounts).values({
    ...(input.id ? { id: input.id } : {}),
    userId,
    accountName: input.name,
    kind: input.kind,
    institutionCode: input.institutionCode ?? null,
    currency: input.currency ?? "RUB",
    openingBalance,
    openingBalanceDate: input.openingBalanceDate ?? null,
    balance: openingBalance, // операций ещё нет
    lastFour: input.lastFour ?? null,
    creditLimit: input.creditLimit ?? null,
    includeInTotal: input.includeInTotal ?? true,
    color: input.color ?? null,
    icon: input.icon ?? null,
    sortOrder: input.sortOrder ?? 0,
    source: "manual",
  }).returning();
  return { account: (await toAccountDtos([row]))[0], created: true };
}

async function hasTransactions(executor: Executor, accountId: string): Promise<boolean> {
  const [row] = await executor.select({ id: transactions.id }).from(transactions)
    .where(and(eq(transactions.accountId, accountId), isNull(transactions.deletedAt))).limit(1);
  return Boolean(row);
}

export async function updateAccount(userId: string, accountId: string, patch: Partial<AccountInput>): Promise<AccountDto> {
  return db.transaction(async (tx) => {
    const account = await getOwnAccount(tx, userId, accountId);
    if (patch.currency && patch.currency !== (account.currency ?? "RUB") && await hasTransactions(tx, accountId)) {
      throw new ApiError(409, "OPERATION_NOT_ALLOWED", "Нельзя сменить валюту счёта, на котором есть операции");
    }
    const { name, ...rest } = patch;
    await tx.update(accounts).set({ ...rest, ...(name !== undefined ? { accountName: name } : {}), updatedAt: new Date() })
      .where(eq(accounts.id, accountId));
    if (patch.openingBalance !== undefined || patch.openingBalanceDate !== undefined) await recalcAccountBalance(tx, accountId);
    const [updated] = await tx.select().from(accounts).where(eq(accounts.id, accountId));
    return updated;
  }).then(async (row) => (await toAccountDtos([row]))[0]);
}

export async function setArchived(userId: string, accountId: string, archived: boolean): Promise<AccountDto> {
  await getOwnAccount(db, userId, accountId);
  const [row] = await db.update(accounts).set({ archivedAt: archived ? new Date() : null, updatedAt: new Date() })
    .where(eq(accounts.id, accountId)).returning();
  return (await toAccountDtos([row]))[0];
}

/**
 * Удаляет счёт (мягко). С операциями — только при withTransactions: они удаляются вместе со счётом,
 * а у переводов удаляется и вторая нога в другом счёте (перевод не может остаться наполовину).
 */
export async function deleteAccount(userId: string, accountId: string, withTransactions: boolean): Promise<void> {
  await db.transaction(async (tx) => {
    await getOwnAccount(tx, userId, accountId);
    if (await hasTransactions(tx, accountId)) {
      if (!withTransactions) {
        throw new ApiError(409, "OPERATION_NOT_ALLOWED", "На счёте есть операции: удалите их вместе со счётом (withTransactions=true) или архивируйте счёт");
      }
      const now = new Date();
      const groups = (await tx.selectDistinct({ group: transactions.transferGroupId }).from(transactions)
        .where(and(eq(transactions.accountId, accountId), isNull(transactions.deletedAt))))
        .map((row) => row.group).filter((group): group is string => Boolean(group));
      const counterparts = groups.length
        ? await tx.update(transactions).set({ deletedAt: now, updatedAt: now })
          .where(and(inArray(transactions.transferGroupId, groups), isNull(transactions.deletedAt), sql`${transactions.accountId} <> ${accountId}`))
          .returning({ accountId: transactions.accountId })
        : [];
      await tx.update(transactions).set({ deletedAt: now, updatedAt: now })
        .where(and(eq(transactions.accountId, accountId), isNull(transactions.deletedAt)));
      for (const other of new Set(counterparts.map((row) => row.accountId))) await recalcAccountBalance(tx, other);
    }
    await tx.update(accounts).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(accounts.id, accountId));
  });
}

/**
 * Сверка остатка: если фактический остаток на дату отличается от посчитанного на ту же дату,
 * создаётся операция-корректировка на разницу (в статистику не входит). Без расхождения — ничего.
 */
export async function adjustBalance(userId: string, accountId: string, actualBalance: string, date: string) {
  const result = await db.transaction(async (tx) => {
    const account = await getOwnAccount(tx, userId, accountId);
    if (account.archivedAt) throw new ApiError(409, "ACCOUNT_ARCHIVED", "Счёт в архиве");
    if (account.openingBalanceDate && date < account.openingBalanceDate) {
      throw new ApiError(400, "VALIDATION_ERROR", "Дата сверки раньше даты начального остатка");
    }
    const [row] = await tx.select({
      balance: sql<string>`(${account.openingBalance}::numeric + coalesce(sum(${transactions.amount}), 0))::text`,
    }).from(transactions).where(and(
      eq(transactions.accountId, accountId),
      isNull(transactions.deletedAt),
      eq(transactions.status, "posted"),
      sql`${transactions.localDate} <= ${date}`,
      account.openingBalanceDate ? sql`${transactions.localDate} >= ${account.openingBalanceDate}` : undefined,
    ));
    const diff = toKopecks(actualBalance) - toKopecks(row.balance);
    if (diff === 0n) return { adjustment: null as Transaction | null, diff };

    const currency = account.currency ?? "RUB";
    const amount = fromKopecks(diff);
    const [adjustment] = await tx.insert(transactions).values({
      userId,
      accountId,
      type: "adjustment",
      amount,
      currency,
      amountRub: currency === "RUB" ? amount : null,
      description: "Корректировка остатка",
      transactionDate: new Date(`${date}T12:00:00+03:00`),
      localDate: date,
      hasTime: false,
      source: "manual",
    }).returning();
    await recalcAccountBalance(tx, accountId);
    return { adjustment, diff };
  });
  return {
    account: await getAccount(userId, accountId),
    adjustment: result.adjustment ? toTransactionDto(result.adjustment) : null,
    diff: result.diff,
  };
}
