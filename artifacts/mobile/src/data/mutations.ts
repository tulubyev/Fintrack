import { todayIso } from "@workspace/shared/money";
import type { LocalStore } from "./store";

/**
 * Правки счетов, бюджетов, целей, взносов, подписок, категорий и правил (E2.1-T8) — через очередь, как операции
 * (data/transactions.ts): сразу видны на устройстве и уходят на сервер, когда есть сеть. Тела — как у эндпоинтов v1,
 * локальные поля — как DTO синхронизации (services/syncService.ts), чтобы до и после синхронизации экран был тем же.
 */

type Fields = Record<string, unknown>;
const now = () => new Date().toISOString();
const monthStart = () => `${todayIso().slice(0, 7)}-01`;

// ---------------------------------------------------------------- счета

export interface NewAccount {
  name: string;
  kind: string;
  currency: string;
  openingBalance: string;
  includeInTotal?: boolean;
}

export function createAccount(store: LocalStore, id: string, input: NewAccount): Promise<void> {
  const includeInTotal = input.includeInTotal ?? true;
  return store.mutate({
    entity: "accounts", id, kind: "create", method: "POST", path: "/api/v1/accounts",
    body: { id, name: input.name, kind: input.kind, currency: input.currency, openingBalance: input.openingBalance, openingBalanceDate: todayIso(), includeInTotal },
    patch: {
      id, name: input.name, kind: input.kind, institutionCode: null, currency: input.currency, balance: input.openingBalance,
      balanceRub: input.currency === "RUB" ? input.openingBalance : null, openingBalance: input.openingBalance, openingBalanceDate: todayIso(),
      lastFour: null, creditLimit: null, includeInTotal, color: null, icon: null, sortOrder: 0, source: "manual", archivedAt: null,
      lastTransactionDate: null, createdAt: now(), updatedAt: now(),
    },
  });
}

export function updateAccount(store: LocalStore, id: string, patch: { name?: string; includeInTotal?: boolean }): Promise<void> {
  return store.mutate({ entity: "accounts", id, kind: "update", method: "PATCH", path: `/api/v1/accounts/${id}`, body: patch, patch });
}

export function setAccountArchived(store: LocalStore, id: string, archived: boolean): Promise<void> {
  return store.mutate({
    entity: "accounts", id, kind: "update", method: "POST", path: `/api/v1/accounts/${id}/${archived ? "archive" : "unarchive"}`,
    patch: { archivedAt: archived ? now() : null }, mergeable: false,
  });
}

/** Корректировка остатка: сервер создаёт операцию-корректировку на разницу; на устройстве сразу виден новый остаток. */
export function adjustBalance(store: LocalStore, id: string, actualBalance: string, currency: string): Promise<void> {
  return store.mutate({
    entity: "accounts", id, kind: "update", method: "POST", path: `/api/v1/accounts/${id}/balance-adjustments`,
    body: { actualBalance, date: todayIso() },
    patch: { balance: actualBalance, ...(currency === "RUB" ? { balanceRub: actualBalance } : {}) },
    mergeable: false,
  });
}

// ---------------------------------------------------------------- бюджеты

export function createBudget(store: LocalStore, id: string, input: { categoryId: string | null; amount: string; rollover: boolean }): Promise<void> {
  return store.mutate({
    entity: "budgets", id, kind: "create", method: "POST", path: "/api/v1/budgets",
    body: { id, categoryId: input.categoryId, amount: input.amount, rollover: input.rollover },
    patch: {
      id, categoryId: input.categoryId, amount: input.amount, period: "month", effectiveFrom: monthStart(), effectiveTo: null,
      rollover: input.rollover, excludedCategoryIds: [], alertThresholds: [80, 100], createdAt: now(), updatedAt: now(),
    },
  });
}

/** Смена лимита — с текущего месяца, как правка на сайте (сервер может завести новую версию — она придёт синхронизацией). */
export function updateBudget(store: LocalStore, id: string, patch: { amount?: string; rollover?: boolean }): Promise<void> {
  return store.mutate({ entity: "budgets", id, kind: "update", method: "PATCH", path: `/api/v1/budgets/${id}`, body: patch, patch });
}

export function deleteBudget(store: LocalStore, id: string): Promise<void> {
  return store.mutate({ entity: "budgets", id, kind: "delete", method: "DELETE", path: `/api/v1/budgets/${id}` });
}

// ---------------------------------------------------------------- цели и взносы

export function createGoal(store: LocalStore, id: string, input: { name: string; targetAmount: string; targetDate: string | null }): Promise<void> {
  return store.mutate({
    entity: "goals", id, kind: "create", method: "POST", path: "/api/v1/goals",
    body: { id, name: input.name, targetAmount: input.targetAmount, targetDate: input.targetDate },
    patch: {
      id, name: input.name, description: null, targetAmount: input.targetAmount, targetDate: input.targetDate, accountId: null,
      accountBaseline: null, icon: null, color: null, completedAt: null, archivedAt: null, createdAt: now(), updatedAt: now(),
    },
  });
}

export function updateGoal(store: LocalStore, id: string, patch: { name?: string; targetAmount?: string; targetDate?: string | null }): Promise<void> {
  return store.mutate({ entity: "goals", id, kind: "update", method: "PATCH", path: `/api/v1/goals/${id}`, body: patch, patch });
}

export function setGoalArchived(store: LocalStore, id: string, archived: boolean): Promise<void> {
  return store.mutate({
    entity: "goals", id, kind: "update", method: "POST", path: `/api/v1/goals/${id}/${archived ? "archive" : "unarchive"}`,
    patch: { archivedAt: archived ? now() : null }, mergeable: false,
  });
}

export function deleteGoal(store: LocalStore, id: string): Promise<void> {
  return store.mutate({ entity: "goals", id, kind: "delete", method: "DELETE", path: `/api/v1/goals/${id}` });
}

/** Взнос: положительный — пополнение, отрицательный — снятие. */
export function addContribution(store: LocalStore, id: string, goalId: string, input: { amount: string; note: string | null; date?: string }): Promise<void> {
  const date = input.date ?? todayIso();
  return store.mutate({
    entity: "goalContributions", id, kind: "create", method: "POST", path: `/api/v1/goals/${goalId}/contributions`,
    body: { id, amount: input.amount, date, note: input.note },
    patch: { id, goalId, amount: input.amount, date, note: input.note, transactionId: null, createdAt: now(), updatedAt: now() },
  });
}

export function deleteContribution(store: LocalStore, id: string, goalId: string): Promise<void> {
  return store.mutate({ entity: "goalContributions", id, kind: "delete", method: "DELETE", path: `/api/v1/goals/${goalId}/contributions/${id}` });
}

// ---------------------------------------------------------------- подписки

export type SeriesDecision = "confirmed" | "ignored" | "cancelled";

/** Подтвердить подписку, отметить «это не подписка» или «отменил». */
export function setSeriesStatus(store: LocalStore, id: string, status: SeriesDecision): Promise<void> {
  const patch: Fields = { status, ...(status === "cancelled" ? { cancelledAt: now() } : {}) };
  return store.mutate({ entity: "recurring", id, kind: "update", method: "PATCH", path: `/api/v1/recurring/${id}`, body: { status }, patch });
}

// ---------------------------------------------------------------- категории и правила

export function createCategory(store: LocalStore, id: string, input: { name: string; kind: "expense" | "income"; parentId: string | null }): Promise<void> {
  return store.mutate({
    entity: "categories", id, kind: "create", method: "POST", path: "/api/v1/categories",
    body: { id, name: input.name, kind: input.kind, parentId: input.parentId },
    patch: {
      id, parentId: input.parentId, code: null, name: input.name, kind: input.kind, icon: null, color: null, taxDeduction: false,
      sortOrder: 1000, isSystem: false, hidden: false, updatedAt: now(),
    },
  });
}

/**
 * Название: у своей категории меняется само название, у системной — личное (customName); пустое у системной —
 * вернуть стандартное (оно придёт синхронизацией).
 */
export function renameCategory(store: LocalStore, id: string, isSystem: boolean, name: string | null): Promise<void> {
  const body = isSystem ? { customName: name } : { name };
  return store.mutate({
    entity: "categories", id, kind: "update", method: "PATCH", path: `/api/v1/categories/${id}`, body,
    patch: name ? { name } : {},
  });
}

export function setCategoryHidden(store: LocalStore, id: string, hidden: boolean): Promise<void> {
  return store.mutate({ entity: "categories", id, kind: "update", method: "PATCH", path: `/api/v1/categories/${id}`, body: { hidden }, patch: { hidden } });
}

export function deleteRule(store: LocalStore, id: string): Promise<void> {
  return store.mutate({ entity: "rules", id, kind: "delete", method: "DELETE", path: `/api/v1/category-rules/${id}` });
}
