import { describe, expect, it } from "vitest";
import { ApiRequestError, type RequestOptions } from "@workspace/shared/api";
import {
  addContribution, adjustBalance, createAccount, createBudget, createCategory, deleteRule, renameCategory, setAccountArchived,
  setCategoryHidden, setSeriesStatus, updateBudget,
} from "../src/data/mutations";
import { LocalStore } from "../src/data/store";
import { SyncEngine } from "../src/data/sync";
import { nodeSqlite } from "./sqlite";

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

async function setup(respond: (method: string, path: string, body: unknown) => unknown = () => ({})) {
  const store = new LocalStore(nodeSqlite());
  const sent: { method: string; path: string; body: unknown }[] = [];
  const request = async <T>(path: string, init: RequestOptions = {}): Promise<T> => {
    if (path === "/api/v1/sync") return { changes: {}, deleted: {}, nextCursor: "c", hasMore: false } as T;
    sent.push({ method: init.method ?? "GET", path, body: init.body });
    return respond(init.method ?? "GET", path, init.body) as T;
  };
  const engine = new SyncEngine({ store, request });
  engine.stop();
  const sync = async () => {
    await engine.init();
    await engine.sync();
    engine.stop();
  };
  return { store, sent, sync };
}

describe("правки разделов: сразу видны и уходят нужным запросом", () => {
  it("счёт: создание, корректировка остатка, архив — по порядку и не сливаясь", async () => {
    const { store, sent, sync } = await setup();
    await createAccount(store, ID(1), { name: "Наличные", kind: "cash", currency: "RUB", openingBalance: "5000.00" });
    expect(await store.get("accounts", ID(1))).toMatchObject({ name: "Наличные", balance: "5000.00", balanceRub: "5000.00", archivedAt: null });
    await adjustBalance(store, ID(1), "4200.00", "RUB");
    await setAccountArchived(store, ID(1), true);
    expect(await store.get("accounts", ID(1))).toMatchObject({ balance: "4200.00", archivedAt: expect.any(String) });
    await sync();
    expect(sent.map((item) => `${item.method} ${item.path}`)).toEqual([
      "POST /api/v1/accounts",
      `POST /api/v1/accounts/${ID(1)}/balance-adjustments`,
      `POST /api/v1/accounts/${ID(1)}/archive`,
    ]);
    expect(sent[0].body).toMatchObject({ id: ID(1), name: "Наличные", kind: "cash", currency: "RUB", openingBalance: "5000.00" });
    expect(sent[1].body).toMatchObject({ actualBalance: "4200.00" });
  });

  it("бюджет: создание и правка до отправки — один POST с итоговым лимитом", async () => {
    const { store, sent, sync } = await setup();
    await createBudget(store, ID(2), { categoryId: ID(9), amount: "10000.00", rollover: false });
    await updateBudget(store, ID(2), { amount: "12000.00", rollover: true });
    expect(await store.get("budgets", ID(2))).toMatchObject({ amount: "12000.00", rollover: true, effectiveTo: null });
    await sync();
    expect(sent).toEqual([{ method: "POST", path: "/api/v1/budgets", body: { id: ID(2), categoryId: ID(9), amount: "12000.00", rollover: true } }]);
  });

  it("на категорию уже есть бюджет (409 DUPLICATE_RESOURCE) — отказ с текстом сервера, а не конфликт версий", async () => {
    const { store, sync } = await setup((method, path) => {
      if (method === "POST" && path === "/api/v1/budgets") throw new ApiRequestError(409, "DUPLICATE_RESOURCE", "На эту категорию уже есть бюджет в этом месяце");
      return {};
    });
    await createBudget(store, ID(3), { categoryId: ID(9), amount: "1000.00", rollover: false });
    await sync();
    expect(await store.issues()).toMatchObject([{ status: "failed", error: "На эту категорию уже есть бюджет в этом месяце" }]);
    expect(await store.get("budgets", ID(3))).toBeNull();
  });

  it("взнос в цель, решение по подписке, категории и правила", async () => {
    const { store, sent, sync } = await setup();
    await addContribution(store, ID(4), ID(40), { amount: "-500.00", note: "сняли" });
    expect(await store.list("goalContributions")).toMatchObject([{ goalId: ID(40), amount: "-500.00" }]);
    await store.applyPage({ changes: { recurring: [{ id: ID(5), status: "detected" }], categories: [{ id: ID(6), name: "Кафе", isSystem: true, hidden: false }], rules: [{ id: ID(7) }] }, deleted: {}, nextCursor: "c" });
    await setSeriesStatus(store, ID(5), "cancelled");
    await setCategoryHidden(store, ID(6), true);
    await renameCategory(store, ID(6), true, "Кофейни");
    await createCategory(store, ID(8), { name: "Хобби", kind: "expense", parentId: null });
    await deleteRule(store, ID(7));
    expect(await store.get("recurring", ID(5))).toMatchObject({ status: "cancelled", cancelledAt: expect.any(String) });
    expect(await store.get("categories", ID(6))).toMatchObject({ hidden: true, name: "Кофейни" });
    expect(await store.get("rules", ID(7))).toBeNull();
    await sync();
    expect(sent.map((item) => [item.method, item.path, item.body])).toEqual([
      ["POST", `/api/v1/goals/${ID(40)}/contributions`, { id: ID(4), amount: "-500.00", date: expect.any(String), note: "сняли" }],
      ["PATCH", `/api/v1/recurring/${ID(5)}`, { status: "cancelled" }],
      ["PATCH", `/api/v1/categories/${ID(6)}`, { hidden: true, customName: "Кофейни" }], // две правки категории — один запрос
      ["POST", "/api/v1/categories", { id: ID(8), name: "Хобби", kind: "expense", parentId: null }],
      ["DELETE", `/api/v1/category-rules/${ID(7)}`, undefined],
    ]);
  });
});
