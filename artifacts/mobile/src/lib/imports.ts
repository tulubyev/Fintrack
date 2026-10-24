/** Импорт выписки (E2.1-T9): типы ответов /api/v1/imports и чистые помощники экранов — без сети и нативных модулей. */

export type ImportStatus = "uploaded" | "parsing" | "needs_mapping" | "preview" | "committing" | "done" | "failed" | "cancelled" | "undone";
export type RowStatus = "new" | "duplicate" | "possible_duplicate" | "skipped" | "error";

export interface ColumnMapping {
  date: string;
  description: string;
  amount?: string;
  income?: string;
  expense?: string;
  currency?: string;
  mcc?: string;
  category?: string;
  dateFormat?: string;
  signConvention: "signed" | "split" | "expense_positive";
}

export interface SuggestedAccount {
  accountId?: string;
  create?: { name: string; kind: "debit_card"; institutionCode: string | null; currency: string; lastFour: string | null };
  warning?: string;
}

export interface ImportBatch {
  id: string;
  status: ImportStatus;
  fileName: string;
  fileType: string;
  institutionCode: string | null;
  accountId: string | null;
  periodFrom: string | null;
  periodTo: string | null;
  stats: { total?: number; new?: number; duplicate?: number; skipped?: number; error?: number; imported?: number };
  warnings: string[];
  cardLast4: string[];
  accountCurrency: string | null;
  errorMessage: string | null;
  duplicateOfImportId: string | null;
  mappingPreview?: { header: string[] } | null;
  suggestedMapping?: ColumnMapping | null;
  suggestedAccount: SuggestedAccount | null;
  balanceCheck: { statementClosing: string; computedClosing: string; diff: string } | null;
  editedCount?: number;
  createdAt: string;
  committedAt: string | null;
}

export interface ImportRow {
  id: string;
  rowIndex: number;
  status: RowStatus;
  decision: "import" | "skip" | "merge";
  errorMessage: string | null;
  date: string;
  amount: string;
  currency: string;
  description: string;
}

/** Разбор или сохранение ещё идёт — опрашиваем статус. */
export const BUSY: ImportStatus[] = ["uploaded", "parsing", "committing"];

/** Файл, выбранный в проводнике или пришедший через «Поделиться» (expo-share-intent копирует его в кеш приложения). */
export interface PickedFile {
  uri: string;
  name: string;
  mimeType?: string | null;
}

/** Типы выписок для «Поделиться»: сервер всё равно проверяет файл по содержимому, а не по типу. */
export const STATEMENT_MIME_TYPES = [
  "application/pdf",
  "text/csv",
  "text/comma-separated-values",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

export const importable = (row: Pick<ImportRow, "status">) => row.status !== "skipped" && row.status !== "error";
export const toImportCount = (rows: ImportRow[]) => rows.filter((row) => importable(row) && row.decision === "import").length;

/** «дата — Дата операции, сумма — Приход и Расход…» — подсказка сопоставления одной строкой для подтверждения на телефоне. */
export function describeMapping(mapping: ColumnMapping): string {
  const parts = [`дата — «${mapping.date}»`, `описание — «${mapping.description}»`];
  if (mapping.signConvention === "split") parts.push(`приход — «${mapping.income}», расход — «${mapping.expense}»`);
  else parts.push(`сумма — «${mapping.amount}»${mapping.signConvention === "expense_positive" ? " (расходы без минуса)" : ""}`);
  if (mapping.currency) parts.push(`валюта — «${mapping.currency}»`);
  return parts.join(", ");
}

/** Первый файл из «Поделиться», если это похоже на выписку (по типу или расширению). */
export function sharedStatement(files: Array<{ path: string; fileName?: string | null; mimeType?: string | null }> | null | undefined): PickedFile | null {
  const file = files?.[0];
  if (!file?.path) return null;
  const name = file.fileName || file.path.split("/").pop() || "выписка";
  const known = (file.mimeType && STATEMENT_MIME_TYPES.includes(file.mimeType)) || /\.(csv|xlsx|pdf)$/i.test(name);
  if (!known) return null;
  const uri = file.path.startsWith("file://") || file.path.startsWith("content://") ? file.path : `file://${file.path}`;
  return { uri, name, mimeType: file.mimeType };
}

export function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
