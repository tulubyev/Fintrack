/**
 * Формы записей в локальной базе — как в GET /api/v1/sync (DTO сервера, syncService.ts). Здесь только поля,
 * которые читают экраны; остальные приходят и хранятся как есть.
 */

export interface Account {
  id: string;
  name: string;
  kind: string;
  currency: string;
  balance: string;
  balanceRub: string | null;
  includeInTotal: boolean;
  lastFour: string | null;
  archivedAt: string | null;
}

export interface Transaction {
  id: string;
  accountId: string;
  type: "expense" | "income" | "transfer" | "adjustment";
  status: string;
  amount: string;
  currency: string;
  /** Сумма в рублях по курсу на дату операции; null — курса нет. */
  amountRub: string | null;
  date: string;
  time: string | null;
  categoryId: string | null;
  categorySource: string | null;
  merchant: string | null;
  description: string | null;
  note: string | null;
  source: string;
  excludeFromStats: boolean;
}

export interface Category {
  id: string;
  parentId: string | null;
  name: string;
  kind: "expense" | "income" | "transfer" | string;
  icon: string | null;
  color: string | null;
  isSystem: boolean;
  hidden: boolean;
  sortOrder: number;
}

export interface Budget {
  id: string;
  categoryId: string | null;
  amount: string;
  period: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  rollover: boolean;
  excludedCategoryIds: string[];
}

export interface Goal {
  id: string;
  name: string;
  description: string | null;
  targetAmount: string;
  targetDate: string | null;
  /** Привязанный счёт: прогресс — его остаток (минус accountBaseline, если считаем только новые деньги). */
  accountId: string | null;
  accountBaseline: string | null;
  completedAt: string | null;
  archivedAt: string | null;
  createdAt: string | null;
}

export interface GoalContribution {
  id: string;
  goalId: string;
  amount: string;
  date: string;
  note: string | null;
  transactionId: string | null;
}

export interface Series {
  id: string;
  displayName: string;
  direction: string;
  amountLast: string | null;
  expectedAmount: string | null;
  currency: string;
  kind: string;
  accountId: string | null;
  categoryId: string | null;
  periodicity: string | null;
  nextExpectedDate: string | null;
  status: string;
}

export interface Rule {
  id: string;
  field: string;
  op: string;
  pattern: string;
  categoryId: string;
  hitCount: number;
}

/** Название операции для списка: получатель, описание или тип. */
export const transactionTitle = (tx: Transaction) =>
  tx.merchant ?? tx.description ?? (tx.type === "income" ? "Доход" : tx.type === "transfer" ? "Перевод" : "Расход");
