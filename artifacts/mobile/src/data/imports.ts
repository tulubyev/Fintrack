import { api } from "@/auth/device";
import type { ColumnMapping, ImportBatch, ImportRow, PickedFile, SuggestedAccount } from "@/lib/imports";

/**
 * Импорт выписки в приложении (E2.1-T9) — тот же серверный мастер, что на сайте (/api/v1/imports, E1.2): файл разбирает
 * и сохраняет воркер, приложение загружает файл, показывает предпросмотр и опрашивает статус. Это исключение из правила
 * «экраны работают с локальной базой»: импорт без сети невозможен, а операции придут в приложение обычной синхронизацией.
 */

export function uploadStatement(file: PickedFile, fields: { accountId?: string } = {}): Promise<ImportBatch> {
  const form = new FormData();
  // React Native отправляет файл по uri: объект { uri, name, type } — его формат FormData в RN
  form.append("file", { uri: file.uri, name: file.name, type: file.mimeType || "application/octet-stream" } as unknown as Blob);
  if (fields.accountId) form.append("accountId", fields.accountId);
  return api<ImportBatch>("/api/v1/imports", { method: "POST", body: form });
}

export const getImport = (id: string) => api<ImportBatch>(`/api/v1/imports/${id}`);
export const recentImports = () => api<{ items: ImportBatch[] }>("/api/v1/imports", { query: { limit: 5 } });

/** Строки предпросмотра целиком: страницы по 500. */
export async function importRows(id: string): Promise<ImportRow[]> {
  const items: ImportRow[] = [];
  let cursor: string | null = null;
  do {
    const page: { items: ImportRow[]; nextCursor: string | null } = await api(`/api/v1/imports/${id}/rows`, { query: { limit: 500, ...(cursor ? { cursor } : {}) } });
    items.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor);
  return items;
}

export const setMapping = (id: string, mapping: ColumnMapping) =>
  api<ImportBatch>(`/api/v1/imports/${id}/mapping`, { method: "PUT", body: { mapping, remember: true } });
export const decideRow = (id: string, rowId: string, decision: "import" | "skip") =>
  api<{ updated: number }>(`/api/v1/imports/${id}/rows`, { method: "PATCH", body: { decisions: [{ rowId, decision }] } });
export const commitImport = (id: string, body: { accountId: string } | { createAccount: NonNullable<SuggestedAccount["create"]> }) =>
  api<ImportBatch>(`/api/v1/imports/${id}/commit`, { method: "POST", body });
export const undoImport = (id: string) => api<ImportBatch>(`/api/v1/imports/${id}/undo`, { method: "POST" });
export const cancelImport = (id: string) => api<void>(`/api/v1/imports/${id}`, { method: "DELETE" });

