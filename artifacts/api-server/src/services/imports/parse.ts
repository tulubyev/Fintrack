/**
 * Разбор выписки в воркере (очередь import.parse, E1.2-T4): файл → @workspace/statement-parsers → import_rows.
 * Повторяемо: строки батча перезаписываются целиком, а итог пишется, только если батч всё ещё в разборе —
 * удалённый пользователем во время разбора импорт не воскреснет.
 * CSV и XLSX разбираются прямо в задаче; изоляция в worker_threads с таймаутом и лимитом памяти придёт с PDF (T7).
 */
import { and, eq, inArray } from "drizzle-orm";
import { parseStatement, StatementError, type ColumnMapping, type ParsedRow } from "@workspace/statement-parsers";
import { importBatches, importMappings, importRows } from "@shared/schema";
import { db } from "../../db";
import { track } from "../analytics";
import { logger } from "../logger";
import { readImportFile } from "./storage";

const INSERT_CHUNK = 500;
const INTERNAL_MESSAGE = "Не удалось прочитать выписку. Попробуйте загрузить её ещё раз или выберите другой формат (CSV или Excel).";

export async function runImportParse(batchId: string): Promise<void> {
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
  const rows = statement.rows.map((row) => toImportRow(batchId, row));
  const stats = {
    total: rows.length,
    new: rows.filter((row) => row.status === "new").length,
    duplicate: 0,
    possibleDuplicate: 0,
    skipped: rows.filter((row) => row.status === "skipped").length,
    error: 0,
  };
  const saved = await db.transaction(async (tx) => {
    const [updated] = await tx.update(importBatches).set({
      status: "preview",
      parserCode: statement.parserCode,
      institutionCode: statement.institution ?? batch.institutionCode,
      periodFrom: statement.periodFrom,
      periodTo: statement.periodTo,
      statementOpeningBalance: statement.openingBalance,
      statementClosingBalance: statement.closingBalance,
      stats,
      parseResult: { warnings: statement.warnings, cardLast4: statement.cardLast4, accountCurrency: statement.accountCurrency, accountNumberMasked: statement.accountNumberMasked },
      parsedAt: new Date(),
    }).where(and(eq(importBatches.id, batchId), eq(importBatches.status, "parsing"))).returning({ id: importBatches.id });
    if (!updated) return false;
    await tx.delete(importRows).where(eq(importRows.batchId, batchId));
    for (let i = 0; i < rows.length; i += INSERT_CHUNK) await tx.insert(importRows).values(rows.slice(i, i + INSERT_CHUNK));
    return true;
  });
  if (saved) {
    void track("import_parsed", { userId: batch.userId, props: { parser_code: statement.parserCode, rows: rows.length, duration_ms: Date.now() - started, status: "preview" } });
  }
}

/** Строка предпросмотра: отклонённые банком не импортируются; дубли и категории — на следующих шагах (T13). */
function toImportRow(batchId: string, row: ParsedRow): typeof importRows.$inferInsert {
  const { raw, ...parsed } = row;
  const rejected = row.status === "failed";
  return {
    batchId,
    rowIndex: row.rowIndex,
    parsed,
    raw,
    status: rejected ? "skipped" : "new",
    decision: rejected ? "skip" : "import",
    errorMessage: rejected ? "Пропущено: отклонена банком" : null,
  };
}
