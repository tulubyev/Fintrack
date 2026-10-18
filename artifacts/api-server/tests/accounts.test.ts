/**
 * API счетов v1 (E1.1-T3): создание, итоги в рублях, остаток из операций, сверка, архив, удаление, права.
 */
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { eq, inArray } from "drizzle-orm";
import { db, accounts, transactions, fxRates } from "@workspace/db";
import { recalcAccountBalance } from "../src/services/ledgerService";
import { app, auth, registerUser, type TestUser } from "./helpers";

let a: TestUser;
let b: TestUser;
const today = new Date().toISOString().slice(0, 10);

beforeAll(async () => {
  [a, b] = [await registerUser(), await registerUser()];
});

const as = (user: TestUser) => ({
  get: (url: string) => request(app).get(url).set(auth(user.token)),
  post: (url: string, body?: object) => request(app).post(url).set(auth(user.token)).send(body ?? {}),
  patch: (url: string, body: object) => request(app).patch(url).set(auth(user.token)).send(body),
  delete: (url: string) => request(app).delete(url).set(auth(user.token)),
});

const createAccount = async (user: TestUser, body: object) => {
  const res = await as(user).post("/api/v1/accounts", body);
  expect(res.status).toBe(201);
  return res.body;
};

const addTransaction = (userId: string, accountId: string, amount: string, extra: Partial<typeof transactions.$inferInsert> = {}) =>
  db.insert(transactions).values({
    userId, accountId, amount, amountRub: amount, description: "тест", transactionDate: new Date(), localDate: today,
    type: amount.startsWith("-") ? "expense" : "income", ...extra,
  }).returning().then(([row]) => row);

describe("создание счёта", () => {
  it("минимальный счёт: значения по умолчанию", async () => {
    const account = await createAccount(a, { name: "Наличные", kind: "cash" });
    expect(account).toMatchObject({
      name: "Наличные", kind: "cash", currency: "RUB", balance: "0.00", balanceRub: "0.00", openingBalance: "0.00",
      source: "manual", includeInTotal: true, archivedAt: null, lastTransactionDate: null,
    });
  });

  it("начальный остаток становится остатком, суммы нормализуются", async () => {
    const account = await createAccount(a, { name: "Карта Сбера", kind: "debit_card", institutionCode: "sber", openingBalance: "10000", lastFour: "1234" });
    expect(account).toMatchObject({ balance: "10000.00", openingBalance: "10000.00", institutionCode: "sber", lastFour: "1234" });
  });

  it("повтор с тем же id не создаёт дубль; чужой id — 409", async () => {
    const id = randomUUID();
    const first = await as(a).post("/api/v1/accounts", { id, name: "ИИС", kind: "iis" });
    const again = await as(a).post("/api/v1/accounts", { id, name: "ИИС", kind: "iis" });
    expect([first.status, again.status]).toEqual([201, 200]);
    expect(again.body.id).toBe(id);
    expect((await db.select().from(accounts).where(eq(accounts.id, id)))).toHaveLength(1);

    const stolen = await as(b).post("/api/v1/accounts", { id, name: "Чужой", kind: "cash" });
    expect(stolen.status).toBe(409);
    expect(stolen.body.error.code).toBe("DUPLICATE_RESOURCE");
  });

  it.each([
    ["пустое имя", { name: " ", kind: "cash" }],
    ["неизвестный вид", { name: "x", kind: "crypto" }],
    ["сумма с запятой", { name: "x", kind: "cash", openingBalance: "12,50" }],
    ["три цифры карты", { name: "x", kind: "debit_card", lastFour: "123" }],
    ["отрицательный лимит", { name: "x", kind: "credit_card", creditLimit: "-1" }],
    ["несуществующая дата", { name: "x", kind: "cash", openingBalanceDate: "2026-02-31" }],
    ["лишнее поле", { name: "x", kind: "cash", balance: "100" }],
  ])("%s → 400", async (_title, body) => {
    const res = await as(a).post("/api/v1/accounts", body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("список и итоги", () => {
  it("итог в рублях по курсу ЦБ, без архивных и исключённых из общего баланса", async () => {
    const user = await registerUser();
    await createAccount(user, { name: "Рубли", kind: "debit_card", openingBalance: "1000.50" });
    // курсы общие для всех тестов: берём валюту, которую другие тесты не трогают, и начинаем без её курса
    await db.delete(fxRates).where(eq(fxRates.currency, "CNY"));
    const cny = await createAccount(user, { name: "Юани", kind: "current", currency: "CNY", openingBalance: "100" });
    await createAccount(user, { name: "Не в итоге", kind: "cash", openingBalance: "999", includeInTotal: false });
    const archived = await createAccount(user, { name: "Закрытая", kind: "debit_card", openingBalance: "777" });
    await as(user).post(`/api/v1/accounts/${archived.id}/archive`);

    let res = await as(user).get("/api/v1/accounts");
    expect(res.body.items.map((item: { name: string }) => item.name)).not.toContain("Закрытая");
    expect(res.body.totals).toEqual({
      balanceRub: "1000.50",
      byCurrency: [{ currency: "RUB", balance: "1000.50" }, { currency: "CNY", balance: "100.00" }],
      currenciesWithoutRate: ["CNY"],
    });

    await db.insert(fxRates).values({ date: "2026-10-17", currency: "CNY", rateRub: "12.555555" }).onConflictDoNothing();
    res = await as(user).get("/api/v1/accounts");
    // 100 × 12,555555 = 1255,5555 → округление до копейки вверх: 1255,56
    expect(res.body.items.find((item: { id: string }) => item.id === cny.id).balanceRub).toBe("1255.56");
    expect(res.body.totals).toMatchObject({ balanceRub: "2256.06", currenciesWithoutRate: [] });

    res = await as(user).get("/api/v1/accounts?includeArchived=true");
    expect(res.body.items.map((item: { name: string }) => item.name)).toContain("Закрытая");
  });
});

describe("остаток", () => {
  it("остаток = начальный + операции; удаление операции возвращает остаток", async () => {
    const account = await createAccount(a, { name: "Карта", kind: "debit_card", openingBalance: "10000.00" });
    const expense = await addTransaction(a.id, account.id, "-1234.50");
    await recalcAccountBalance(db, account.id);
    expect((await as(a).get(`/api/v1/accounts/${account.id}`)).body).toMatchObject({ balance: "8765.50", lastTransactionDate: today });

    await db.update(transactions).set({ deletedAt: new Date() }).where(eq(transactions.id, expense.id));
    await recalcAccountBalance(db, account.id);
    expect((await as(a).get(`/api/v1/accounts/${account.id}`)).body.balance).toBe("10000.00");
  });

  it("операции до даты начального остатка не учитываются, pending — тоже", async () => {
    const account = await createAccount(a, { name: "Вклад", kind: "deposit", openingBalance: "500.00", openingBalanceDate: today });
    await addTransaction(a.id, account.id, "-100.00", { localDate: "2020-01-01" });
    await addTransaction(a.id, account.id, "-50.00", { status: "pending" });
    await addTransaction(a.id, account.id, "25.00");
    await recalcAccountBalance(db, account.id);
    expect((await as(a).get(`/api/v1/accounts/${account.id}`)).body.balance).toBe("525.00");
  });

  it("сверка создаёт корректировку на разницу, без расхождения — ничего", async () => {
    const account = await createAccount(a, { name: "Сверка", kind: "debit_card", openingBalance: "10000.00" });
    await addTransaction(a.id, account.id, "-200.00");
    await recalcAccountBalance(db, account.id);

    const res = await as(a).post(`/api/v1/accounts/${account.id}/balance-adjustments`, { actualBalance: "8765.50", date: today });
    expect(res.status).toBe(200);
    expect(res.body.account.balance).toBe("8765.50");
    expect(res.body.adjustment).toMatchObject({ type: "adjustment", amount: "-1034.50", date: today, time: null, accountId: account.id });

    const again = await as(a).post(`/api/v1/accounts/${account.id}/balance-adjustments`, { actualBalance: "8765.50", date: today });
    expect(again.body.adjustment).toBeNull();
  });
});

describe("изменение, архив, удаление", () => {
  it("правка полей и пересчёт при смене начального остатка", async () => {
    const account = await createAccount(a, { name: "Старое имя", kind: "debit_card", openingBalance: "100.00" });
    await addTransaction(a.id, account.id, "-30.00");
    const res = await as(a).patch(`/api/v1/accounts/${account.id}`, { name: "Новое имя", openingBalance: "200", color: "#ff0000" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: "Новое имя", openingBalance: "200.00", balance: "170.00", color: "#ff0000" });
  });

  it("валюту нельзя сменить, если есть операции", async () => {
    const empty = await createAccount(a, { name: "Пустой", kind: "current" });
    expect((await as(a).patch(`/api/v1/accounts/${empty.id}`, { currency: "EUR" })).body.currency).toBe("EUR");

    const used = await createAccount(a, { name: "С операциями", kind: "current" });
    await addTransaction(a.id, used.id, "10.00");
    const res = await as(a).patch(`/api/v1/accounts/${used.id}`, { currency: "EUR" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("OPERATION_NOT_ALLOWED");
  });

  it("в архивном счёте сверка запрещена, после разархивации — снова можно", async () => {
    const account = await createAccount(a, { name: "Архив", kind: "debit_card" });
    expect((await as(a).post(`/api/v1/accounts/${account.id}/archive`)).body.archivedAt).not.toBeNull();
    const blocked = await as(a).post(`/api/v1/accounts/${account.id}/balance-adjustments`, { actualBalance: "1", date: today });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe("ACCOUNT_ARCHIVED");
    expect((await as(a).post(`/api/v1/accounts/${account.id}/unarchive`)).body.archivedAt).toBeNull();
    expect((await as(a).post(`/api/v1/accounts/${account.id}/balance-adjustments`, { actualBalance: "1", date: today })).status).toBe(200);
  });

  it("счёт с операциями удаляется только вместе с ними; у перевода удаляется и вторая нога", async () => {
    const from = await createAccount(a, { name: "Откуда", kind: "debit_card", openingBalance: "1000" });
    const to = await createAccount(a, { name: "Куда", kind: "savings" });
    const group = randomUUID();
    await addTransaction(a.id, from.id, "-300.00", { type: "transfer", transferGroupId: group });
    await addTransaction(a.id, to.id, "300.00", { type: "transfer", transferGroupId: group });
    await recalcAccountBalance(db, from.id);
    await recalcAccountBalance(db, to.id);

    const refused = await as(a).delete(`/api/v1/accounts/${from.id}`);
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe("OPERATION_NOT_ALLOWED");

    expect((await as(a).delete(`/api/v1/accounts/${from.id}?withTransactions=true`)).status).toBe(204);
    expect((await as(a).get(`/api/v1/accounts/${from.id}`)).status).toBe(404);
    const legs = await db.select().from(transactions).where(eq(transactions.transferGroupId, group));
    expect(legs.every((leg) => leg.deletedAt !== null)).toBe(true);
    expect((await as(a).get(`/api/v1/accounts/${to.id}`)).body.balance).toBe("0.00");
  });

  it("пустой счёт удаляется сразу", async () => {
    const account = await createAccount(a, { name: "Лишний", kind: "other" });
    expect((await as(a).delete(`/api/v1/accounts/${account.id}`)).status).toBe(204);
    expect((await as(a).get("/api/v1/accounts")).body.items.map((item: { id: string }) => item.id)).not.toContain(account.id);
  });
});

describe("права: пользователь B не видит и не меняет счета A", () => {
  let accountId: string;
  beforeAll(async () => {
    accountId = (await createAccount(a, { name: "Секретный", kind: "debit_card", openingBalance: "5000" })).id;
  });

  it("B не видит счёт A в списке", async () => {
    expect((await as(b).get("/api/v1/accounts?includeArchived=true")).body.items.map((item: { id: string }) => item.id)).not.toContain(accountId);
  });

  it.each([
    ["get", (id: string) => as(b).get(`/api/v1/accounts/${id}`)],
    ["patch", (id: string) => as(b).patch(`/api/v1/accounts/${id}`, { name: "Взлом" })],
    ["archive", (id: string) => as(b).post(`/api/v1/accounts/${id}/archive`)],
    ["unarchive", (id: string) => as(b).post(`/api/v1/accounts/${id}/unarchive`)],
    ["balance-adjustments", (id: string) => as(b).post(`/api/v1/accounts/${id}/balance-adjustments`, { actualBalance: "0", date: today })],
    ["delete", (id: string) => as(b).delete(`/api/v1/accounts/${id}?withTransactions=true`)],
  ])("%s → 404", async (_name, call) => {
    const res = await call(accountId);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("счёт A не изменился", async () => {
    expect((await as(a).get(`/api/v1/accounts/${accountId}`)).body).toMatchObject({ name: "Секретный", balance: "5000.00", archivedAt: null });
    const [row] = await db.select().from(accounts).where(inArray(accounts.id, [accountId]));
    expect(row.deletedAt).toBeNull();
  });

  it("некорректный id — 404", async () => {
    expect((await as(a).get("/api/v1/accounts/not-a-uuid")).status).toBe(404);
  });
});

describe("справочник банков", () => {
  it("отдаёт банки с форматами выписок", async () => {
    const res = await as(a).get("/api/v1/institutions");
    expect(res.status).toBe(200);
    expect(res.body.map((item: { code: string }) => item.code)).toEqual(["sber", "tbank", "alfa", "vtb", "ozon", "yandex", "gazprom", "raif", "other"]);
  });
});
