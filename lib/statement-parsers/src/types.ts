/** Тип файла — по сигнатуре содержимого, не по расширению. */
export type FileType = 'csv' | 'xlsx' | 'xls' | 'pdf';

export type StatementFile = { name: string; bytes: Uint8Array; mime?: string | null };

export type RowStatus = 'posted' | 'pending' | 'failed';

/** Одна операция выписки. Суммы — строки «-1234.50» (решение D11), со знаком, в валюте счёта. */
export type ParsedRow = {
  rowIndex: number; // номер строки данных в файле, с 0 — по нему считается dedup_seq и показываются ошибки
  date: string; // YYYY-MM-DD
  time: string | null; // HH:MM:SS
  postedDate: string | null;
  amount: string;
  currency: string;
  originalAmount: string | null;
  originalCurrency: string | null;
  description: string;
  merchant: string | null;
  mcc: string | null;
  bankCategory: string | null;
  cardLast4: string | null;
  externalId: string | null;
  authCode: string | null;
  status: RowStatus;
  balanceAfter: string | null;
  cashback: string | null;
  raw: Record<string, string>; // исходные ячейки — только для отладки (import_rows.raw)
};

export type ParsedStatement = {
  parserCode: string; // tbank_csv@1, generic_csv@1…
  institution: string | null; // institution_code счёта: tbank, sber…
  accountCurrency: string | null;
  accountNumberMasked: string | null;
  cardLast4: string[];
  periodFrom: string | null;
  periodTo: string | null;
  openingBalance: string | null;
  closingBalance: string | null;
  rows: ParsedRow[];
  warnings: string[];
  /** Заголовок таблицы, по которой разобрана выписка (CSV, XLSX): сервер проверяет по нему сопоставление и запоминает его. */
  table?: { header: string[]; fingerprint: string };
};

/**
 * Сопоставление колонок для универсального импорта (import_mappings.mapping). Колонки — по тексту заголовка.
 * signConvention: signed — сумма со знаком; split — приход и расход в разных колонках; expense_positive — расходы
 * положительные, доходы со знаком минус.
 */
export type ColumnMapping = {
  date: string;
  amount?: string;
  income?: string;
  expense?: string;
  description: string;
  currency?: string;
  mcc?: string;
  category?: string;
  dateFormat?: DateFormat;
  signConvention: 'signed' | 'split' | 'expense_positive';
  defaultCurrency?: string;
};

export type DateFormat = 'DD.MM.YYYY' | 'DD.MM.YY' | 'YYYY-MM-DD' | 'DD/MM/YYYY' | 'MM/DD/YYYY';

/** Таблица из CSV или XLSX: заголовок найден, строки данных — после него. */
export type TablePreview = {
  header: string[];
  headerRowIndex: number;
  rows: string[][]; // первые 20 строк данных — для экрана сопоставления
  fingerprint: string; // sha256 нормализованного заголовка — ключ import_mappings
  fileType: 'csv' | 'xlsx';
};

export type ParseResult =
  | { status: 'parsed'; statement: ParsedStatement }
  | { status: 'needs_mapping'; table: TablePreview; suggested: ColumnMapping | null };

export type ParseOptions = {
  /** Принудительно этот парсер (повторный разбор с тем же кодом). */
  parserCode?: string;
  /** Сопоставление от пользователя — для универсального импорта. */
  mapping?: ColumnMapping;
  /** Запомненные сопоставления пользователя по отпечатку заголовка. */
  mappings?: Record<string, ColumnMapping>;
};

export const STATEMENT_ERROR_CODES = [
  'UNSUPPORTED_FILE',
  'PDF_ENCRYPTED',
  'PDF_NO_TEXT',
  'FORMAT_NOT_RECOGNIZED',
  'EMPTY_STATEMENT',
  'TOO_MANY_ROWS',
  'FILE_TOO_LARGE',
  'BAD_MAPPING',
] as const;
export type StatementErrorCode = (typeof STATEMENT_ERROR_CODES)[number];

/** Ошибка разбора с кодом для API (import_batches.error_code) и текстом по-русски — с действием для пользователя. */
export class StatementError extends Error {
  constructor(
    readonly code: StatementErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'StatementError';
  }
}

export const LIMITS = {
  maxRows: 50_000,
  maxUncompressedBytes: 50 * 1024 * 1024, // XLSX: защита от zip-бомб
  previewRows: 20,
} as const;
