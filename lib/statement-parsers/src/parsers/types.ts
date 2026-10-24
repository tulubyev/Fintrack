import type { HeadedTable } from '../table';
import type { ParsedStatement } from '../types';

/** Парсер табличной выписки конкретного банка. Код с версией: tbank_csv@1 — при смене формата появится @2. */
export type TableParser = {
  code: string;
  institution: string;
  fileType: 'csv' | 'xlsx';
  /** Уверенность 0…1 по заголовку и первым строкам; ≥ 0.5 — берём этот парсер без вопросов. */
  detect: (headed: HeadedTable) => number;
  parse: (headed: HeadedTable) => ParsedStatement;
};
