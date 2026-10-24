/**
 * Очистка импорта (D8): исходный файл живёт 30 дней с загрузки, строки разбора — 30 дней после коммита.
 * Неоконченный импорт старше 30 дней (предпросмотр, сопоставление, ошибка) удаляется целиком: строки, файл, статус cancelled.
 * Повторяемо: отсутствующий файл не ошибка.
 */
import { and, eq, inArray, isNotNull, lt, sql } from "drizzle-orm";
import { importBatches, importRows } from "@shared/schema";
import { db } from "../../db";
import { removeImportFile } from "./storage";

export const RETENTION_DAYS = 30;

export async function cleanupImports(now = new Date()): Promise<{ files: number; batches: number; abandoned: number }> {
  const cutoff = new Date(now.getTime() - RETENTION_DAYS * 86_400_000);

  const abandoned = await db.update(importBatches).set({ status: "cancelled", parseResult: null })
    .where(and(inArray(importBatches.status, ["uploaded", "needs_mapping", "preview", "failed"]), lt(importBatches.createdAt, cutoff)))
    .returning({ id: importBatches.id });
  if (abandoned.length) await db.delete(importRows).where(inArray(importRows.batchId, abandoned.map((batch) => batch.id)));

  const expired = await db.select({ id: importBatches.id, storedPath: importBatches.storedPath }).from(importBatches)
    .where(and(isNotNull(importBatches.storedPath), lt(importBatches.createdAt, cutoff), sql`${importBatches.status} not in ('parsing', 'committing')`));
  for (const batch of expired) {
    await removeImportFile(batch.storedPath!);
    await db.update(importBatches).set({ storedPath: null }).where(eq(importBatches.id, batch.id));
  }

  const committed = await db.select({ id: importBatches.id }).from(importBatches)
    .where(and(inArray(importBatches.status, ["done", "undone"]), lt(importBatches.committedAt, cutoff)));
  if (committed.length) await db.delete(importRows).where(inArray(importRows.batchId, committed.map((batch) => batch.id)));

  return { files: expired.length, batches: committed.length, abandoned: abandoned.length };
}
