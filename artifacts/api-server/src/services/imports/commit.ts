/**
 * Коммит импорта (очередь import.commit, E1.2-T14). Одна транзакция БД: строки ещё раз проверяются на дубли против
 * текущего состояния счёта, операции вставляются пачками по 500, остаток пересчитывается, батч → done. Любая ошибка
 * откатывает всё — в счёте не остаётся ни одной операции батча, батч возвращается в предпросмотр с текстом ошибки.
 * После коммита: нейросеть для нераспознанных категорий, поиск регулярных платежей, проверка бюджетов.
 */
import { and, eq, isNull, lte, sql } from "drizzle-orm";
import { accounts, importBatches, importRows, transactions, type Account, type ImportBatch } from "@shared/schema";
import { db } from "../../db";
import { fromKopecks, toKopecks } from "../../lib/money";
import { track } from "../analytics";
import { logger } from "../logger";
import { scheduleBudgetCheck } from "../budgetAlertService";
import { scheduleLlmCategorization } from "../categorization/llm";
import { recordRuleHits } from "../categorization/pipeline";
import { recalcAccountBalance, type Executor } from "../ledgerService";
import { toRub } from "../transactionService";
import { categorizeRows, classifyRows, countStats, effectiveDecision, loadRows, saveClassification, type StoredCategorization, type StoredRow } from "./prepare";

const INSERT_CHUNK = 500;
const MSK_OFFSET = "+03:00";

type ParseResultJson = Record<string, unknown> & { dedupAccountId?: string | null };

export async function runImportCommit(batchId: string): Promise<void> {
  const started = Date.now();
  let outcome: { batch: ImportBatch; account: Account; inserted: Array<{ id: string; categorySource: string }>; ruleIds: Array<string | null>; stats: ReturnType<typeof countStats> & { imported: number }; newAccount: boolean } | null;
  try {
    outcome = await db.transaction(async (tx) => {
      const [batch] = await tx.select().from(importBatches).where(and(eq(importBatches.id, batchId), eq(importBatches.status, "committing"))).for("update");
      if (!batch || !batch.accountId) return null; // уже сохранён, отменён или повтор задачи
      const [account] = await tx.select().from(accounts).where(and(eq(accounts.id, batch.accountId), eq(accounts.userId, batch.userId), isNull(accounts.deletedAt))).for("update");
      if (!account) throw new CommitError("Счёт не найден — выберите другой счёт");
      if (account.archivedAt) throw new CommitError("Счёт в архиве — выберите другой счёт или верните его из архива");

      const rows = await loadRows(tx, batchId);
      const { classified, maxSeq } = await classifyRows(tx, rows, account);
      await saveClassification(tx, classified);
      const parseResult = (batch.parseResult ?? {}) as ParseResultJson;
      const sameAccount = parseResult.dedupAccountId === account.id;
      // категории предпросмотра годятся, если счёт тот же (правила бывают привязаны к счёту); иначе — заново
      const fresh = sameAccount ? new Map<string, StoredCategorization>()
        : await categorizeRows(tx, batch.userId, classified.map((item) => ({ ...item.row, status: item.status })), account, batch.institutionCode);
      const hadTransactions = await accountHasTransactions(tx, account.id);

      const nextSeq = new Map(maxSeq);
      const toInsert: Array<{ rowId: string; values: typeof transactions.$inferInsert; ruleId: string | null }> = [];
      for (const item of classified) {
        const decision = effectiveDecision({ status: item.status, decision: item.row.decision });
        if (decision !== "import" || item.status === "skipped" || item.status === "error" || !item.dedupHash) continue;
        const parsed = item.row.parsed as StoredRow;
        const seq = (nextSeq.get(item.dedupHash) ?? 0) + 1;
        nextSeq.set(item.dedupHash, seq);
        const auto = item.row.categoryId ? null : (fresh.get(item.row.id) ?? (item.row.categorization as StoredCategorization | null));
        const amountRub = await toRub(tx, parsed.amount, parsed.currency, parsed.date);
        toInsert.push({
          rowId: item.row.id,
          ruleId: auto?.ruleId ?? null,
          values: {
            userId: batch.userId,
            accountId: account.id,
            type: parsed.amount.startsWith("-") ? "expense" : "income",
            amount: parsed.amount,
            currency: parsed.currency,
            amountRub,
            originalAmount: parsed.originalAmount,
            originalCurrency: parsed.originalCurrency,
            localDate: parsed.date,
            transactionDate: new Date(`${parsed.date}T${parsed.time ?? "12:00:00"}${MSK_OFFSET}`),
            hasTime: Boolean(parsed.time),
            status: parsed.status === "pending" ? "pending" : "posted",
            description: parsed.description,
            merchant: parsed.merchant?.slice(0, 200) ?? null,
            mcc: parsed.mcc,
            bankCategory: parsed.bankCategory?.slice(0, 100) ?? null,
            externalTransactionId: parsed.externalId,
            categoryId: item.row.categoryId ?? auto?.categoryId ?? null,
            categorySource: item.row.categoryId ? "manual" : (auto?.source ?? "none"),
            categoryConfidence: item.row.categoryId ? null : (auto?.confidence ?? null),
            merchantNormalized: auto?.merchantNormalized ?? null,
            source: "import",
            importBatchId: batch.id,
            dedupHash: item.dedupHash,
            dedupSeq: seq,
            metadata: { cardLast4: parsed.cardLast4, cashback: parsed.cashback, postedDate: parsed.postedDate },
          },
        });
      }

      const inserted: Array<{ id: string; categorySource: string }> = [];
      for (let i = 0; i < toInsert.length; i += INSERT_CHUNK) {
        const chunk = toInsert.slice(i, i + INSERT_CHUNK);
        const ids = await tx.insert(transactions).values(chunk.map((item) => item.values)).returning({ id: transactions.id, categorySource: transactions.categorySource });
        inserted.push(...ids);
        const links = chunk.map((item, j) => sql`(${item.rowId}::uuid, ${ids[j].id}::uuid)`);
        await tx.execute(sql`UPDATE import_rows AS r SET transaction_id = v.tx FROM (VALUES ${sql.join(links, sql`, `)}) AS v(id, tx) WHERE r.id = v.id`);
      }

      // первый импорт в пустой счёт: остаток на начало берём из выписки
      if (!hadTransactions && batch.statementOpeningBalance !== null && batch.periodFrom) {
        await tx.update(accounts).set({ openingBalance: batch.statementOpeningBalance, openingBalanceDate: batch.periodFrom }).where(eq(accounts.id, account.id));
      }
      await recalcAccountBalance(tx, account.id);
      const balanceCheck = batch.statementClosingBalance !== null && batch.periodTo ? await checkBalance(tx, account.id, batch.periodTo, batch.statementClosingBalance) : null;

      const stats = { ...countStats(classified), imported: inserted.length };
      await tx.update(importBatches).set({
        status: "done",
        committedAt: new Date(),
        errorCode: null,
        errorMessage: null,
        stats,
        parseResult: { ...parseResult, dedupAccountId: account.id, balanceCheck },
      }).where(eq(importBatches.id, batchId));
      return { batch, account, inserted, ruleIds: toInsert.map((item) => item.ruleId), stats, newAccount: !hadTransactions };
    });
  } catch (error) {
    const message = error instanceof CommitError ? error.message : "Не удалось сохранить операции. Попробуйте ещё раз — в счёт ничего не записано.";
    if (!(error instanceof CommitError)) logger.error(`import.commit ${batchId}:`, error);
    await db.update(importBatches).set({ status: "preview", errorCode: error instanceof CommitError ? "COMMIT_REJECTED" : "INTERNAL", errorMessage: message })
      .where(and(eq(importBatches.id, batchId), eq(importBatches.status, "committing")));
    return;
  }
  if (!outcome) return;

  const { batch, inserted, stats } = outcome;
  await recordRuleHits(outcome.ruleIds);
  await scheduleLlmCategorization(batch.userId, inserted.filter((row) => row.categorySource === "none").map((row) => row.id));
  await scheduleRecurringDetect(batch.userId);
  await scheduleBudgetCheck(batch.userId);
  const periodDays = batch.periodFrom && batch.periodTo ? Math.round((Date.parse(batch.periodTo) - Date.parse(batch.periodFrom)) / 86_400_000) + 1 : null;
  void track("import_completed", { userId: batch.userId, props: {
    parser_code: batch.parserCode, imported: stats.imported, duplicates: stats.duplicate, possible_duplicates_merged: 0,
    skipped: stats.skipped, errors: stats.error, period_days: periodDays, new_account: outcome.newAccount, duration_ms: Date.now() - started,
  } });
}

class CommitError extends Error {}

async function accountHasTransactions(executor: Executor, accountId: string): Promise<boolean> {
  const [row] = await executor.select({ id: transactions.id }).from(transactions)
    .where(and(eq(transactions.accountId, accountId), isNull(transactions.deletedAt))).limit(1);
  return Boolean(row);
}

/** Сверка остатка: расчётный остаток счёта на конец периода выписки против остатка в выписке. */
async function checkBalance(executor: Executor, accountId: string, periodTo: string, statementClosing: string) {
  const [account] = await executor.select({ opening: accounts.openingBalance, openingDate: accounts.openingBalanceDate }).from(accounts).where(eq(accounts.id, accountId));
  const [{ total }] = await executor.select({ total: sql<string>`coalesce(sum(${transactions.amount}), 0)::text` }).from(transactions).where(and(
    eq(transactions.accountId, accountId), isNull(transactions.deletedAt), eq(transactions.status, "posted"), lte(transactions.localDate, periodTo),
    account.openingDate ? sql`${transactions.localDate} >= ${account.openingDate}` : undefined,
  ));
  const computed = toKopecks(account.opening) + toKopecks(total);
  const diff = toKopecks(statementClosing) - computed;
  return { statementClosing, computedClosing: fromKopecks(computed), diff: fromKopecks(diff) };
}

async function scheduleRecurringDetect(userId: string): Promise<void> {
  const { enqueue, jobsBoss } = await import("../../jobs");
  if (!jobsBoss()) return;
  try {
    await enqueue("recurring.detect", { userId }, { singletonKey: `import-${userId}` });
  } catch (error) {
    logger.warn("recurring.detect после импорта:", error);
  }
}
