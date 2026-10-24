/**
 * Разбор выписки в воркере (очередь import.parse, E1.2-T4): файл → @workspace/statement-parsers → import_rows.
 * Повторяемо: строки батча перезаписываются целиком, а итог пишется, только если батч всё ещё в разборе —
 * удалённый пользователем во время разбора импорт не воскреснет.
 * CSV и XLSX разбираются прямо в задаче; изоляция в worker_threads с таймаутом и лимитом памяти придёт с PDF (T7).
 */
import { and, eq, inArray } from "drizzle-orm";
import { parseStatement, StatementError, type ColumnMapping, type ParsedRow } from "@workspace/statement-parsers";
import { accounts, importBatches, importMappings, importRows, type ImportRow } from "@shared/schema";
import { db } from "../../db";
import { track } from "../analytics";
import { logger } from "../logger";
import { categorizeRows, classifyRows, countStats, saveCategorization, saveClassification, suggestAccount } from "./prepare";
import { readImportFile } from "./storage";

const INSERT_CHUNK = 500;
const INTERNAL_MESSAGE = "Не удалось прочитать выписку. Попробуйте загрузить её ещё раз или выберите другой формат (CSV или Excel).";

export async function runImportParse(batchId: string, options: { rememberMapping?: boolean } = {}): Promise<void> {
  const [batch] = await db.update(importBatches)
    .set({ status: "parsing", errorCode: null, errorMessage: null })
    .where(and(eq(importBatches.id, batchId), inArray(importBatches.status, ["uploaded", "parsing"])))
    .returning();
  if (!batch) return; // удалён, уже разобран или повтор задачи после успеха
  const started = Date.now();

  const fail = async (code: string, message: string, parserCode: string | null = null) => {
    await db.update(importBatches).set({ status: "failed", errorCode: code, errorMessage: message, parsedAt: new Date() })
      .where(and(eq(importBatches.id, batchId), eq(importBatches.status, "parsing")));
    void track("import_failed", { userId: batch.userId, props: { parser_code: parserCode, error_code: code, file_type: batch.fileType } });
  };

  if (!batch.storedPath) return fail("INTERNAL", INTERNAL_MESSAGE);
  let result: Awaited<ReturnType<typeof parseStatement>>;
  try {
    const bytes = await readImportFile(batch.storedPath);
    const remembered = await db.select({ fingerprint: importMappings.headerFingerprint, mapping: importMappings.mapping })
      .from(importMappings).where(eq(importMappings.userId, batch.userId));
    result = await parseStatement(
      { name: batch.fileName, bytes: new Uint8Array(bytes) },
      {
        mapping: (batch.columnMapping as ColumnMapping | null) ?? undefined,
        mappings: Object.fromEntries(remembered.map((item) => [item.fingerprint, item.mapping as ColumnMapping])),
      },
    );
  } catch (error) {
    if (error instanceof StatementError) return fail(error.code, error.message);
    logger.error(`import.parse ${batchId}:`, error);
    return fail("INTERNAL", INTERNAL_MESSAGE);
  }

  if (result.status === "needs_mapping") {
    await db.update(importBatches).set({
      status: "needs_mapping",
      parsedAt: new Date(),
      parseResult: { mappingPreview: result.table, suggestedMapping: result.suggested },
    }).where(and(eq(importBatches.id, batchId), eq(importBatches.status, "parsing")));
    void track("import_mapping_required", { userId: batch.userId, props: { file_type: batch.fileType, columns: result.table.header.length } });
    void track("import_parsed", { userId: batch.userId, props: { parser_code: null, rows: result.table.rows.length, duration_ms: Date.now() - started, status: "needs_mapping" } });
    return;
  }

  const { statement } = result;
  const saved = await db.transaction(async (tx) => {
    const [locked] = await tx.select({ id: importBatches.id }).from(importBatches)
      .where(and(eq(importBatches.id, batchId), eq(importBatches.status, "parsing"))).for("update");
    if (!locked) return null;
    await tx.delete(importRows).where(eq(importRows.batchId, batchId));
    const values = statement.rows.map((row) => toImportRow(batchId, row));
    const inserted: ImportRow[] = [];
    for (let i = 0; i < values.length; i += INSERT_CHUNK) inserted.push(...await tx.insert(importRows).values(values.slice(i, i + INSERT_CHUNK)).returning());

    // счёт: выбранный при загрузке или найденный по цифрам карты; без счёта дубли проверит коммит
    const suggestedAccount = await suggestAccount(batch.userId, {
      accountId: batch.accountId, institution: statement.institution ?? batch.institutionCode, currency: statement.accountCurrency,
      cardLast4: statement.cardLast4, accountNumberMasked: statement.accountNumberMasked,
    });
    const [account] = suggestedAccount.accountId ? await tx.select().from(accounts).where(eq(accounts.id, suggestedAccount.accountId)) : [];
    let rows = inserted;
    let stats = countStats(inserted);
    if (account) {
      const { classified } = await classifyRows(tx, inserted, account);
      await saveClassification(tx, classified);
      stats = countStats(classified);
      rows = classified.map((item) => ({ ...item.row, status: item.status }));
    }
    await saveCategorization(tx, await categorizeRows(tx, batch.userId, rows, account ?? null, statement.institution ?? batch.institutionCode));

    await tx.update(importBatches).set({
      status: "preview",
      parserCode: statement.parserCode,
      institutionCode: statement.institution ?? batch.institutionCode,
      periodFrom: statement.periodFrom,
      periodTo: statement.periodTo,
      statementOpeningBalance: statement.openingBalance,
      statementClosingBalance: statement.closingBalance,
      stats,
      parseResult: {
        warnings: statement.warnings,
        cardLast4: statement.cardLast4,
        accountCurrency: statement.accountCurrency,
        accountNumberMasked: statement.accountNumberMasked,
        table: statement.table ?? null,
        suggestedAccount,
        dedupAccountId: account?.id ?? null,
      },
      parsedAt: new Date(),
    }).where(eq(importBatches.id, batchId));
    return stats;
  });
  if (!saved) return;
  // сопоставление от пользователя с «запомнить» — после успешного разбора, чтобы не запоминать неработающее
  if (options.rememberMapping && batch.columnMapping && statement.table) {
    await db.insert(importMappings).values({ userId: batch.userId, headerFingerprint: statement.table.fingerprint, mapping: batch.columnMapping })
      .onConflictDoUpdate({ target: [importMappings.userId, importMappings.headerFingerprint], set: { mapping: batch.columnMapping, createdAt: new Date() } });
  }
  void track("import_parsed", { userId: batch.userId, props: { parser_code: statement.parserCode, rows: saved.total, duration_ms: Date.now() - started, status: "preview" } });
}

/** Строка предпросмотра: отклонённые банком не импортируются; дубли и категории проставляет prepare.ts. */
function toImportRow(batchId: string, row: ParsedRow): typeof importRows.$inferInsert {
  const { raw, ...parsed } = row;
  const rejected = row.status === "failed";
  return {
    batchId,
    rowIndex: row.rowIndex,
    parsed,
    raw,
    status: rejected ? "skipped" : "new",
    decision: null, // по умолчанию решение следует статусу (prepare.ts, defaultDecision)
    errorMessage: rejected ? "Пропущено: отклонена банком" : null,
  };
}
