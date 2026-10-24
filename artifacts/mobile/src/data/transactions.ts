import { fromKopecks, toKopecks } from "@workspace/shared/money";
import type { LocalStore } from "./store";

/**
 * Операции на устройстве (E2.1-T5): создание, правка, удаление через очередь — работает и без сети.
 * Тела запросов — как у POST/PATCH /api/v1/transactions; локальная запись повторяет TransactionDto сервера,
 * чтобы лента выглядела одинаково до и после синхронизации.
 */

const BASE = "/api/v1/transactions";

export interface NewTransaction {
  accountId: string;
  type: "expense" | "income";
  /** Положительная сумма строкой, «150.00»; знак задаёт type. */
  amount: string;
  /** YYYY-MM-DD */
  date: string;
  time?: string | null;
  categoryId?: string | null;
  merchant?: string | null;
  description?: string | null;
  note?: string | null;
}

export type TransactionPatch = Partial<Pick<NewTransaction, "accountId" | "type" | "amount" | "date" | "time" | "categoryId" | "merchant" | "note">> & {
  excludeFromStats?: boolean;
};

interface LocalTransaction {
  type: "expense" | "income" | string;
  amount: string;
}

const signed = (type: string, amount: string) => fromKopecks(type === "expense" ? -toKopecks(amount) : toKopecks(amount));
const positive = (amount: string) => fromKopecks(toKopecks(amount) < 0n ? -toKopecks(amount) : toKopecks(amount));

export async function createTransaction(store: LocalStore, id: string, input: NewTransaction, nowIso = new Date().toISOString()): Promise<void> {
  const account = await store.get<{ currency?: string }>("accounts", input.accountId);
  const currency = account?.currency ?? "RUB";
  const amount = signed(input.type, input.amount);
  await store.mutate({
    entity: "transactions",
    id,
    kind: "create",
    method: "POST",
    path: BASE,
    body: { id, ...input, amount: positive(input.amount) },
    patch: {
      id, accountId: input.accountId, type: input.type, status: "posted", amount, currency,
      amountRub: currency === "RUB" ? amount : null, originalAmount: null, originalCurrency: null,
      date: input.date, time: input.time ?? null, categoryId: input.categoryId ?? null,
      categorySource: input.categoryId ? "manual" : null, merchant: input.merchant ?? null,
      description: input.description ?? null, note: input.note ?? null, mcc: null, transferGroupId: null,
      transferCounterpartAccountId: null, source: "manual", importBatchId: null, recurringSeriesId: null,
      excludeFromStats: false, createdAt: nowIso, updatedAt: nowIso,
    },
  });
}

/** applyToSimilar — «эта и будущие» (правило категории): такую правку нельзя слить с соседними. */
export async function updateTransaction(
  store: LocalStore,
  id: string,
  patch: TransactionPatch,
  applyToSimilar: "none" | "future" | "future_and_past" = "none",
): Promise<void> {
  const current = await store.get<LocalTransaction>("transactions", id);
  if (!current) throw new Error("Операция не найдена");
  const local: Record<string, unknown> = { ...patch };
  const body: Record<string, unknown> = { ...patch };
  if (patch.amount !== undefined || patch.type !== undefined) {
    // На сервер — положительная сумма и тип, в локальную запись — сумма со знаком, как в DTO
    const type = patch.type ?? current.type;
    const amount = patch.amount ?? positive(current.amount);
    local.amount = signed(type, amount);
    body.amount = positive(amount);
    body.type = type;
    local.type = type;
  }
  if (patch.categoryId !== undefined) local.categorySource = patch.categoryId ? "manual" : null;
  if (applyToSimilar !== "none") body.applyToSimilar = applyToSimilar;
  await store.mutate({
    entity: "transactions",
    id,
    kind: "update",
    method: "PATCH",
    path: `${BASE}/${id}`,
    body,
    patch: local,
    mergeable: applyToSimilar === "none",
  });
}

export function deleteTransaction(store: LocalStore, id: string): Promise<void> {
  return store.mutate({ entity: "transactions", id, kind: "delete", method: "DELETE", path: `${BASE}/${id}` });
}
