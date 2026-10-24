/**
 * Импорт выписок (E1.2-T4): загрузка, статус, строки разбора, отмена до коммита.
 * Разбор идёт в воркере (очередь import.parse, parse.ts); клиент опрашивает GET /api/v1/imports/:id раз в секунду.
 * Чужой импорт — 404, как и несуществующий.
 */
import { createHash, randomUUID } from "node:crypto";
import { and, asc, desc, eq, gt, gte, inArray, isNull, lt, notInArray, or, sql, type SQL } from "drizzle-orm";
import { sniffFileType } from "@workspace/statement-parsers";
import { accounts, importBatches, importRows, type ImportBatch, type ImportRow } from "@shared/schema";
import { db } from "../../db";
import { ApiError } from "../../lib/apiError";
import { track } from "../analytics";
import { logger } from "../logger";
import { enqueue, jobsBoss } from "../../jobs";
import { removeImportFile, saveImportFile, storedPathFor } from "./storage";

export const MAX_FILE_BYTES = 15 * 1024 * 1024;
export const DAILY_UPLOADS = 30;
export const PARSE_JOB = "import.parse";

/** До коммита импорт можно удалить; строки видны с предпросмотра. */
const CANCELLABLE = ["uploaded", "parsing", "needs_mapping", "preview", "failed"] as const;
const ROWS_VISIBLE = ["preview", "committing", "done", "undone"] as const;
/** Повторный файл: тот же sha256 у импорта, который не отменён и не удалён. */
const DUPLICATE_SOURCES = ["uploaded", "parsing", "needs_mapping", "preview", "committing", "done"] as const;

export type ImportStats = { total?: number; new?: number; duplicate?: number; possibleDuplicate?: number; skipped?: number; error?: number; imported?: number };

export type ImportBatchDto = {
  id: string;
  status: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  parserCode: string | null;
  institutionCode: string | null;
  accountId: string | null;
  periodFrom: string | null;
  periodTo: string | null;
  statementOpeningBalance: string | null;
  statementClosingBalance: string | null;
  stats: ImportStats;
  warnings: string[];
  cardLast4: string[];
  accountCurrency: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  duplicateOfImportId: string | null;
  mappingPreview?: unknown;
  suggestedMapping?: unknown;
  createdAt: string;
  parsedAt: string | null;
  committedAt: string | null;
};

type ParseResultJson = {
  warnings?: string[];
  cardLast4?: string[];
  accountCurrency?: string | null;
  mappingPreview?: unknown;
  suggestedMapping?: unknown;
};

export function toBatchDto(batch: ImportBatch, duplicateOfImportId: string | null = null): ImportBatchDto {
  const result = (batch.parseResult ?? {}) as ParseResultJson;
  return {
    id: batch.id,
    status: batch.status,
    fileName: batch.fileName,
    fileType: batch.fileType,
    fileSize: batch.fileSize,
    parserCode: batch.parserCode,
    institutionCode: batch.institutionCode,
    accountId: batch.accountId,
    periodFrom: batch.periodFrom,
    periodTo: batch.periodTo,
    statementOpeningBalance: batch.statementOpeningBalance,
    statementClosingBalance: batch.statementClosingBalance,
    stats: (batch.stats ?? {}) as ImportStats,
    warnings: result.warnings ?? [],
    cardLast4: result.cardLast4 ?? [],
    accountCurrency: result.accountCurrency ?? null,
    errorCode: batch.errorCode,
    errorMessage: batch.errorMessage,
    duplicateOfImportId,
    ...(batch.status === "needs_mapping" ? { mappingPreview: result.mappingPreview ?? null, suggestedMapping: result.suggestedMapping ?? null } : {}),
    createdAt: batch.createdAt.toISOString(),
    parsedAt: batch.parsedAt?.toISOString() ?? null,
    committedAt: batch.committedAt?.toISOString() ?? null,
  };
}

async function findDuplicate(userId: string, sha256: string, exceptId?: string): Promise<{ id: string; createdAt: Date } | null> {
  const conditions: SQL[] = [eq(importBatches.userId, userId), eq(importBatches.fileSha256, sha256), inArray(importBatches.status, [...DUPLICATE_SOURCES])];
  if (exceptId) conditions.push(sql`${importBatches.id} <> ${exceptId}`);
  const [found] = await db.select({ id: importBatches.id, createdAt: importBatches.createdAt }).from(importBatches)
    .where(and(...conditions)).orderBy(asc(importBatches.createdAt)).limit(1);
  return found ?? null;
}

/** Имя файла для показа: без пути и управляющих символов, до 255 символов. */
function cleanFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 255);
  return cleaned || "выписка";
}

function sizeBucket(bytes: number): string {
  if (bytes < 100 * 1024) return "<100k";
  if (bytes < 1024 * 1024) return "100k-1m";
  if (bytes < 5 * 1024 * 1024) return "1m-5m";
  return "5m+";
}

export async function uploadImport(userId: string, input: { fileName: string; bytes: Buffer; accountId?: string | null; institutionCode?: string | null }): Promise<ImportBatchDto> {
  const fileType = sniffFileType(input.bytes);
  if (fileType === null || fileType === "xls") {
    const message = fileType === "xls"
      ? "Старый формат Excel (XLS) пока не читаем. Откройте файл в Excel и сохраните как XLSX или CSV."
      : "Этот файл не похож на выписку. Загрузите CSV, Excel (XLSX) или PDF из банка.";
    throw new ApiError(415, "UNSUPPORTED_FILE", message);
  }
  if (input.accountId) {
    const [account] = await db.select({ id: accounts.id }).from(accounts)
      .where(and(eq(accounts.id, input.accountId), eq(accounts.userId, userId), isNull(accounts.deletedAt)));
    if (!account) throw new ApiError(404, "NOT_FOUND", "Счёт не найден");
  }
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(importBatches)
    .where(and(eq(importBatches.userId, userId), gte(importBatches.createdAt, sql`now() - interval '1 day'`)));
  if (count >= DAILY_UPLOADS) {
    throw new ApiError(429, "RATE_LIMITED", `Не больше ${DAILY_UPLOADS} выписок в сутки. Попробуйте завтра.`);
  }

  const sha256 = createHash("sha256").update(input.bytes).digest("hex");
  const duplicate = await findDuplicate(userId, sha256);
  const id = randomUUID();
  const storedPath = storedPathFor(userId, id);
  // сначала файл, потом строка: строка без файла сломала бы разбор; не записалась строка — файл удаляем сразу
  await saveImportFile(storedPath, input.bytes);
  const [batch] = await db.insert(importBatches).values({
    id,
    userId,
    accountId: input.accountId ?? null,
    fileName: cleanFileName(input.fileName),
    fileSize: input.bytes.length,
    fileSha256: sha256,
    fileType,
    storedPath,
    institutionCode: input.institutionCode ?? null,
  }).returning().catch(async (error: unknown) => {
    await removeImportFile(storedPath);
    throw error;
  });

  await scheduleParse(batch.id);
  void track("import_started", { userId, props: { institution_hint: input.institutionCode ?? null, file_type: fileType, size_bucket: sizeBucket(input.bytes.length) } });
  return toBatchDto(batch, duplicate?.id ?? null);
}

export async function scheduleParse(batchId: string): Promise<void> {
  if (!jobsBoss()) {
    logger.warn(`${PARSE_JOB}: очередь не запущена, импорт ${batchId} ждёт воркера`);
    return;
  }
  await enqueue(PARSE_JOB, { batchId }, { singletonKey: batchId });
}

async function ownBatch(userId: string, id: string): Promise<ImportBatch> {
  const [batch] = await db.select().from(importBatches).where(and(eq(importBatches.id, id), eq(importBatches.userId, userId)));
  if (!batch) throw new ApiError(404, "NOT_FOUND", "Импорт не найден");
  return batch;
}

export async function getImport(userId: string, id: string): Promise<ImportBatchDto> {
  const batch = await ownBatch(userId, id);
  const duplicate = await findDuplicate(userId, batch.fileSha256, batch.id);
  // повтором считается только более поздняя загрузка того же файла
  return toBatchDto(batch, duplicate && duplicate.createdAt < batch.createdAt ? duplicate.id : null);
}

/** Список импортов, новые сверху; курсор — «createdAt|id» последнего элемента. Удалённые до коммита не показываются. */
export async function listImports(userId: string, options: { limit: number; cursor?: string }): Promise<{ items: ImportBatchDto[]; nextCursor: string | null }> {
  const conditions: SQL[] = [eq(importBatches.userId, userId), notInArray(importBatches.status, ["cancelled"])];
  if (options.cursor) {
    const [at, id] = options.cursor.split("|");
    const date = new Date(at);
    if (!id || Number.isNaN(date.getTime())) throw new ApiError(400, "VALIDATION_ERROR", "Некорректный курсор");
    conditions.push(or(lt(importBatches.createdAt, date), and(eq(importBatches.createdAt, date), lt(importBatches.id, id)))!);
  }
  const rows = await db.select().from(importBatches).where(and(...conditions))
    .orderBy(desc(importBatches.createdAt), desc(importBatches.id)).limit(options.limit + 1);
  const page = rows.slice(0, options.limit);
  const last = page[page.length - 1];
  return {
    items: page.map((batch) => toBatchDto(batch)),
    nextCursor: rows.length > options.limit && last ? `${last.createdAt.toISOString()}|${last.id}` : null,
  };
}

export type ImportRowDto = Record<string, unknown> & { id: string; rowIndex: number; status: string; decision: string | null };

function toRowDto(row: ImportRow): ImportRowDto {
  return {
    ...(row.parsed as Record<string, unknown>),
    id: row.id,
    rowIndex: row.rowIndex,
    status: row.status,
    decision: row.decision,
    errorMessage: row.errorMessage,
    matchTransactionId: row.matchTransactionId,
    suggestedCategoryId: row.suggestedCategoryId,
    transactionId: row.transactionId,
  };
}

/** Строки разбора по порядку файла; курсор — rowIndex последней строки. */
export async function listImportRows(userId: string, id: string, options: { limit: number; cursor?: number; status?: string[] }): Promise<{ items: ImportRowDto[]; nextCursor: string | null }> {
  const batch = await ownBatch(userId, id);
  if (!(ROWS_VISIBLE as readonly string[]).includes(batch.status)) {
    throw new ApiError(409, "IMPORT_STATE_CONFLICT", "Строки появятся после разбора выписки");
  }
  const conditions: SQL[] = [eq(importRows.batchId, id)];
  if (options.cursor !== undefined) conditions.push(gt(importRows.rowIndex, options.cursor));
  if (options.status?.length) conditions.push(inArray(importRows.status, options.status));
  const rows = await db.select().from(importRows).where(and(...conditions)).orderBy(asc(importRows.rowIndex)).limit(options.limit + 1);
  const page = rows.slice(0, options.limit);
  return {
    items: page.map(toRowDto),
    nextCursor: rows.length > options.limit ? String(page[page.length - 1].rowIndex) : null,
  };
}

/** Удаление до коммита: файл и строки стираются сразу, батч остаётся со статусом cancelled (для истории и лимита). */
export async function cancelImport(userId: string, id: string): Promise<void> {
  const batch = await ownBatch(userId, id);
  const [cancelled] = await db.update(importBatches)
    .set({ status: "cancelled", storedPath: null, parseResult: null })
    .where(and(eq(importBatches.id, id), inArray(importBatches.status, [...CANCELLABLE])))
    .returning({ id: importBatches.id });
  if (!cancelled) throw new ApiError(409, "IMPORT_STATE_CONFLICT", "Импорт уже сохранён — его можно только отменить");
  await db.delete(importRows).where(eq(importRows.batchId, id));
  if (batch.storedPath) await removeImportFile(batch.storedPath);
}
