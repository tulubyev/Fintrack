/**
 * Подготовка строк импорта к коммиту (E1.2-T13, T14): какой счёт предложить, какие строки — дубли (строгий ключ),
 * какую категорию предложить. Вызывается после разбора (предпросмотр) и ещё раз внутри коммита — с окончательным счётом
 * и свежим состоянием базы: между предпросмотром и коммитом мог прийти другой импорт.
 */
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { dedupHash, dedupSequence, type ParsedRow } from "@workspace/statement-parsers";
import { accounts, importRows, transactions, type Account, type ImportRow } from "@shared/schema";
import { db } from "../../db";
import { INSTITUTIONS } from "../../lib/institutions";
import { createCategorizer, type CategorizeResult } from "../categorization/pipeline";
import { toRub } from "../transactionService";
import type { Executor } from "../ledgerService";

export type StoredRow = Omit<ParsedRow, "raw">;
export type RowStatus = "new" | "duplicate" | "possible_duplicate" | "skipped" | "error";
export type Decision = "import" | "skip" | "merge";

/** Решение по умолчанию: новые импортируются, дубли, пропущенные и ошибочные — нет. */
export const defaultDecision = (status: string): Decision => (status === "new" ? "import" : "skip");
export const effectiveDecision = (row: Pick<ImportRow, "status" | "decision">): Decision => (row.decision as Decision | null) ?? defaultDecision(row.status);

export type SuggestedAccount = {
  accountId?: string;
  create?: { name: string; kind: "debit_card"; institutionCode: string | null; currency: string; lastFour: string | null };
  warning?: string;
};

/**
 * Счёт для выписки: выбранный пользователем (с предупреждением, если цифры карты не совпали) → единственный счёт того же
 * банка с последними 4 цифрами карты или номера счёта из выписки → предложение создать счёт «Банк •• 1234».
 */
export async function suggestAccount(userId: string, input: {
  accountId: string | null; institution: string | null; currency: string | null; cardLast4: string[]; accountNumberMasked: string | null;
}): Promise<SuggestedAccount> {
  const digits = [...new Set([...input.cardLast4, input.accountNumberMasked?.match(/(\d{4})\D*$/)?.[1]].filter((value): value is string => !!value))];
  if (input.accountId) {
    const [account] = await db.select().from(accounts).where(and(eq(accounts.id, input.accountId), eq(accounts.userId, userId), isNull(accounts.deletedAt)));
    if (account) {
      const mismatch = digits.length > 0 && account.lastFour && !digits.includes(account.lastFour);
      return { accountId: account.id, ...(mismatch ? { warning: `В выписке карта •• ${digits.join(", ")}, а у счёта «${account.accountName}» — •• ${account.lastFour}. Проверьте, тот ли это счёт.` } : {}) };
    }
  }
  if (digits.length) {
    const candidates = await db.select({ id: accounts.id, institutionCode: accounts.institutionCode }).from(accounts).where(and(
      eq(accounts.userId, userId), isNull(accounts.deletedAt), isNull(accounts.archivedAt), inArray(accounts.lastFour, digits),
    ));
    const sameBank = candidates.filter((account) => !input.institution || !account.institutionCode || account.institutionCode === input.institution);
    if (sameBank.length === 1) return { accountId: sameBank[0].id };
  }
  const bank = INSTITUTIONS.find((institution) => institution.code === input.institution);
  const lastFour = digits[0] ?? null;
  return {
    create: {
      name: [bank && bank.code !== "other" ? bank.name : "Счёт", lastFour ? `•• ${lastFour}` : null].filter(Boolean).join(" "),
      kind: "debit_card",
      institutionCode: input.institution,
      currency: input.currency ?? "RUB",
      lastFour,
    },
  };
}

export type Classified = {
  row: ImportRow;
  status: RowStatus;
  matchTransactionId: string | null;
  errorMessage: string | null;
  dedupHash: string | null;
  /** номер вхождения в файле; для вставки к нему добавляется сдвиг (insertSeq) */
  fileSeq: number | null;
};

/**
 * Строгая дедупликация: hash = sha256(счёт | дата | сумма | валюта | нормализованное описание), seq — номер вхождения
 * одинакового хеша в файле. Если в счёте уже k операций с этим хешем, строки с seq ≤ k — дубли. Пропущенные банком
 * строки не участвуют; строка в другой валюте, чем счёт, — ошибка. Нечёткие кандидаты и холды — этап P1.
 */
export async function classifyRows(executor: Executor, rows: ImportRow[], account: Pick<Account, "id" | "currency">): Promise<{ classified: Classified[]; maxSeq: Map<string, number> }> {
  const currency = account.currency ?? "RUB";
  const ordered = [...rows].sort((a, b) => a.rowIndex - b.rowIndex);
  const candidates = ordered.filter((row) => row.status !== "skipped" && (row.parsed as StoredRow).currency === currency);
  const hashes = candidates.map((row) => {
    const parsed = row.parsed as StoredRow;
    return dedupHash({ accountId: account.id, date: parsed.date, amount: parsed.amount, currency: parsed.currency, description: parsed.description });
  });
  const seqs = dedupSequence(hashes);
  const unique = [...new Set(hashes)];
  const existing = new Map<string, string[]>();
  const maxSeq = new Map<string, number>();
  for (let i = 0; i < unique.length; i += 1000) {
    const found = await executor.select({ id: transactions.id, hash: transactions.dedupHash, seq: transactions.dedupSeq }).from(transactions)
      .where(and(eq(transactions.accountId, account.id), isNull(transactions.deletedAt), inArray(transactions.dedupHash, unique.slice(i, i + 1000))))
      .orderBy(transactions.dedupSeq);
    for (const item of found) {
      existing.set(item.hash!, [...(existing.get(item.hash!) ?? []), item.id]);
      maxSeq.set(item.hash!, Math.max(maxSeq.get(item.hash!) ?? 0, item.seq ?? 0));
    }
  }
  const byRow = new Map(candidates.map((row, i) => [row.id, { hash: hashes[i], seq: seqs[i] }]));
  const classified = ordered.map((row): Classified => {
    if (row.status === "skipped") return { row, status: "skipped", matchTransactionId: null, errorMessage: row.errorMessage, dedupHash: null, fileSeq: null };
    const key = byRow.get(row.id);
    if (!key) {
      const parsed = row.parsed as StoredRow;
      return { row, status: "error", matchTransactionId: null, errorMessage: `Операция в ${parsed.currency}, а счёт в ${currency}`, dedupHash: null, fileSeq: null };
    }
    const matches = existing.get(key.hash) ?? [];
    const duplicate = key.seq <= matches.length;
    return { row, status: duplicate ? "duplicate" : "new", matchTransactionId: duplicate ? matches[key.seq - 1] : null, errorMessage: null, dedupHash: key.hash, fileSeq: key.seq };
  });
  return { classified, maxSeq };
}

/** Записывает статусы, найденные дубли и ошибки — только изменившиеся строки, пачками. */
export async function saveClassification(executor: Executor, classified: Classified[]): Promise<void> {
  const changed = classified.filter((item) => item.status !== item.row.status || item.matchTransactionId !== item.row.matchTransactionId || item.errorMessage !== item.row.errorMessage);
  for (let i = 0; i < changed.length; i += 500) {
    const values = changed.slice(i, i + 500).map((item) => sql`(${item.row.id}::uuid, ${item.status}, ${item.matchTransactionId}::uuid, ${item.errorMessage})`);
    await executor.execute(sql`
      UPDATE import_rows AS r SET status = v.status, match_transaction_id = v.match, error_message = v.message
      FROM (VALUES ${sql.join(values, sql`, `)}) AS v(id, status, match, message) WHERE r.id = v.id`);
  }
}

export function countStats(classified: Array<{ status: string }>) {
  const count = (status: string) => classified.filter((item) => item.status === status).length;
  return { total: classified.length, new: count("new"), duplicate: count("duplicate"), possibleDuplicate: count("possible_duplicate"), skipped: count("skipped"), error: count("error") };
}

export type StoredCategorization = CategorizeResult & { accountId: string | null };

/** Предложение категорий конвейером E1.3 — на предпросмотр; коммит возьмёт его, если счёт тот же. */
export async function categorizeRows(executor: Executor, userId: string, rows: ImportRow[], account: Pick<Account, "id" | "institutionCode" | "currency"> | null, institution: string | null): Promise<Map<string, StoredCategorization>> {
  const categorize = await createCategorizer(userId);
  const result = new Map<string, StoredCategorization>();
  for (const row of rows) {
    if (row.status === "skipped" || row.status === "error") continue;
    const parsed = row.parsed as StoredRow;
    const amountRub = await toRub(executor, parsed.amount, parsed.currency, parsed.date);
    const outcome = await categorize({
      direction: parsed.amount.startsWith("-") ? "out" : "in",
      amount: Math.abs(Number(parsed.amount)),
      amountRub: amountRub === null ? null : Math.abs(Number(amountRub)),
      merchant: parsed.merchant,
      description: parsed.description,
      mcc: parsed.mcc,
      bankCategory: parsed.bankCategory,
      institutionCode: account?.institutionCode ?? institution,
      accountId: account?.id ?? null,
      date: parsed.date,
    });
    result.set(row.id, { ...outcome, accountId: account?.id ?? null });
  }
  return result;
}

export async function saveCategorization(executor: Executor, categorized: Map<string, StoredCategorization>): Promise<void> {
  const entries = [...categorized];
  for (let i = 0; i < entries.length; i += 500) {
    const values = entries.slice(i, i + 500).map(([id, value]) => sql`(${id}::uuid, ${value.categoryId}::uuid, ${JSON.stringify(value)}::jsonb)`);
    await executor.execute(sql`
      UPDATE import_rows AS r SET suggested_category_id = v.category, categorization = v.data
      FROM (VALUES ${sql.join(values, sql`, `)}) AS v(id, category, data) WHERE r.id = v.id`);
  }
}

export async function loadRows(executor: Executor, batchId: string): Promise<ImportRow[]> {
  return executor.select().from(importRows).where(eq(importRows.batchId, batchId)).orderBy(importRows.rowIndex);
}
