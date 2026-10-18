/**
 * API операций и переводов (E1.1-T4/T5) по критериям приёмки эпика.
 */
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { db, categories, fxRates, transactions } from "@workspace/db";
import { app, auth, registerUser, type TestUser } from "./helpers";

let a: TestUser;
let b: TestUser;

beforeAll(async () => {
  [a, b] = [await registerUser(), await registerUser()];
});

const as = (user: TestUser) => ({
  get: (url: string) => request(app).get(url).set(auth(user.token)),
  post: (url: string, body?: object) => request(app).post(url).set(auth(user.token)).send(body ?? {}),
  patch: (url: string, body: object) => request(app).patch(url).set(auth(user.token)).send(body),
  delete: (url: string) => request(app).delete(url).set(auth(user.token)),
});

async function account(user: TestUser, body: object = {}) {
  const res = await as(user).post("/api/v1/accounts", { name: `Счёт ${randomUUID().slice(0, 6)}`, kind: "debit_card", ...body });
  expect(res.status).toBe(201);
  return res.body as { id: string };
}
const balance = async (user: TestUser, id: string) => (await as(user).get(`/api/v1/accounts/${id}`)).body.balance;
async function spend(user: TestUser, accountId: string, body: object = {}) {
  const res = await as(user).post("/api/v1/transactions", { accountId, type: "expense", amount: "100", date: "2026-10-10", ...body });
  expect(res.status).toBe(201);
  return res.body;
}
const categoryId = async (code: string) => (await db.select().from(categories).where(eq(categories.code, code)))[0].id;

describe("создание и удаление операции", () => {
  it("расход уменьшает остаток, удаление возвращает его (10 000 → 8 765,50 → 10 000)", async () => {
    const acc = await account(a, { openingBalance: "10000.00" });
    const tx = await spend(a, acc.id, { amount: "1234.50", merchant: "Пятёрочка" });
    expect(tx).toMatchObject({ type: "expense", amount: "-1234.50", amountRub: "-1234.50", currency: "RUB", date: "2026-10-10", time: null, source: "manual", description: "Пятёрочка" });
    expect(await balance(a, acc.id)).toBe("8765.50");

    expect((await as(a).delete(`/api/v1/transactions/${tx.id}`)).status).toBe(204);
    expect(await balance(a, acc.id)).toBe("10000.00");
    expect((await as(a).get(`/api/v1/transactions/${tx.id}`)).status).toBe(404);
  });

  it("доход — с плюсом, время сохраняется", async () => {
    const acc = await account(a);
    const res = await as(a).post("/api/v1/transactions", { accountId: acc.id, type: "income", amount: "50000", date: "2026-10-05", time: "09:30", categoryId: await categoryId("inc.salary") });
    expect(res.body).toMatchObject({ type: "income", amount: "50000.00", time: "09:30", categorySource: "manual" });
  });

  it("повтор с тем же id и телом — 200 без дубля; тот же id с другим телом — 409", async () => {
    const acc = await account(a);
    const id = randomUUID();
    const body = { id, accountId: acc.id, type: "expense", amount: "42", date: "2026-10-01" };
    expect((await as(a).post("/api/v1/transactions", body)).status).toBe(201);
    expect((await as(a).post("/api/v1/transactions", body)).status).toBe(200);
    expect(await db.select().from(transactions).where(eq(transactions.id, id))).toHaveLength(1);
    expect(await balance(a, acc.id)).toBe("-42.00");
    const conflict = await as(a).post("/api/v1/transactions", { ...body, amount: "43" });
    expect([conflict.status, conflict.body.error.code]).toEqual([409, "DUPLICATE_RESOURCE"]);
  });

  it("в архивном счёте операция не создаётся", async () => {
    const acc = await account(a);
    await as(a).post(`/api/v1/accounts/${acc.id}/archive`);
    const res = await as(a).post("/api/v1/transactions", { accountId: acc.id, type: "expense", amount: "1", date: "2026-10-01" });
    expect([res.status, res.body.error.code]).toEqual([409, "ACCOUNT_ARCHIVED"]);
  });

  it.each([
    ["нулевая сумма", { amount: "0" }],
    ["отрицательная сумма", { amount: "-5" }],
    ["тип transfer через операции", { type: "transfer" }],
    ["валюта не как у счёта", { currency: "USD" }],
    ["неверное время", { time: "25:00" }],
  ])("%s → 400", async (_title, body) => {
    const acc = await account(a);
    const res = await as(a).post("/api/v1/transactions", { accountId: acc.id, type: "expense", amount: "10", date: "2026-10-01", ...body });
    expect([res.status, res.body.error.code]).toEqual([400, "VALIDATION_ERROR"]);
  });

  it("чужая пользовательская категория — 400", async () => {
    const [food] = await db.select().from(categories).where(eq(categories.code, "food"));
    const [own] = await db.insert(categories).values({ userId: b.id, parentId: food.id, name: `Своя ${randomUUID().slice(0, 6)}`, kind: "expense" }).returning();
    const acc = await account(a);
    const res = await as(a).post("/api/v1/transactions", { accountId: acc.id, type: "expense", amount: "10", date: "2026-10-01", categoryId: own.id });
    expect(res.status).toBe(400);
  });
});

describe("лента: порядок, курсор, фильтры", () => {
  let user: TestUser;
  let card: { id: string };
  let cash: { id: string };
  beforeAll(async () => {
    user = await registerUser();
    card = await account(user, { name: "Карта" });
    cash = await account(user, { name: "Наличные", kind: "cash" });
    await spend(user, card.id, { amount: "300", date: "2026-10-03", merchant: "Перекрёсток", categoryId: await categoryId("food.groceries") });
    await spend(user, card.id, { amount: "1500", date: "2026-10-05", merchant: "Яндекс Go", categoryId: await categoryId("transport.taxi") });
    await spend(user, cash.id, { amount: "50", date: "2026-10-05", merchant: "Шаурма 100%" });
    await as(user).post("/api/v1/transactions", { accountId: card.id, type: "income", amount: "80000", date: "2026-10-01", merchant: "ООО Ромашка" });
    await spend(user, card.id, { amount: "999", date: "2026-10-07", note: "подарок маме" });
  });

  const list = async (query = "") => (await as(user).get(`/api/v1/transactions${query}`)).body;

  it("сортирует по дате по убыванию и листает курсором без пропусков и повторов", async () => {
    const all = await list();
    expect(all.items.map((item: { date: string }) => item.date)).toEqual(["2026-10-07", "2026-10-05", "2026-10-05", "2026-10-03", "2026-10-01"]);
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const page = await list(`?limit=2${cursor ? `&cursor=${cursor}` : ""}`);
      seen.push(...page.items.map((item: { id: string }) => item.id));
      cursor = page.nextCursor;
    } while (cursor);
    expect(seen).toEqual(all.items.map((item: { id: string }) => item.id));
  });

  it("фильтрует по счёту, типу, периоду, сумме по модулю, тексту, категории с подкатегориями и «без категории»", async () => {
    expect((await list(`?accountId=${cash.id}`)).items).toHaveLength(1);
    expect((await list(`?accountId=${cash.id},${card.id}`)).items).toHaveLength(5);
    expect((await list("?type=income")).items.map((item: { amount: string }) => item.amount)).toEqual(["80000.00"]);
    expect((await list("?from=2026-10-04&to=2026-10-05")).items).toHaveLength(2);
    expect((await list("?amountMin=100&amountMax=1000")).items.map((item: { amount: string }) => item.amount)).toEqual(["-999.00", "-300.00"]);
    expect((await list("?q=яндекс")).items.map((item: { merchant: string }) => item.merchant)).toEqual(["Яндекс Go"]);
    expect((await list("?q=100%25")).items.map((item: { merchant: string }) => item.merchant)).toEqual(["Шаурма 100%"]);
    expect((await list("?q=маме")).items).toHaveLength(1);
    expect((await list(`?categoryId=${await categoryId("food")}`)).items.map((item: { merchant: string }) => item.merchant)).toEqual(["Перекрёсток"]);
    expect((await list("?uncategorized=true")).items).toHaveLength(3);
  });

  it("неверный фильтр или курсор — 400", async () => {
    expect((await as(user).get("/api/v1/transactions?type=gift")).status).toBe(400);
    expect((await as(user).get("/api/v1/transactions?cursor=garbage")).status).toBe(400);
  });

  it("итог без переводов и корректировок; расход — положительным числом", async () => {
    await as(user).post("/api/v1/transfers", { fromAccountId: card.id, toAccountId: cash.id, amount: "5000", date: "2026-10-06" });
    await as(user).post(`/api/v1/accounts/${cash.id}/balance-adjustments`, { actualBalance: "10000", date: "2026-10-08" });
    const summary = (await as(user).get("/api/v1/transactions/summary")).body;
    expect(summary).toEqual({ count: 5, income: "80000.00", expense: "2849.00", net: "77151.00" });
  });
});

describe("правка операции", () => {
  it("у ручной меняются сумма, дата и счёт, остатки пересчитываются", async () => {
    const from = await account(a, { openingBalance: "1000" });
    const to = await account(a, { openingBalance: "1000" });
    const tx = await spend(a, from.id, { amount: "100" });
    const res = await as(a).patch(`/api/v1/transactions/${tx.id}`, { amount: "250", accountId: to.id, date: "2026-10-12", time: "18:05", note: "уточнил" });
    expect(res.status).toBe(200);
    expect(res.body.transaction).toMatchObject({ amount: "-250.00", accountId: to.id, date: "2026-10-12", time: "18:05", note: "уточнил" });
    expect([await balance(a, from.id), await balance(a, to.id)]).toEqual(["1000.00", "750.00"]);
  });

  it("у импортированной меняется категория, но не сумма", async () => {
    const acc = await account(a);
    const [imported] = await db.insert(transactions).values({
      userId: a.id, accountId: acc.id, type: "expense", amount: "-70.00", amountRub: "-70.00", description: "Импорт", transactionDate: new Date(), localDate: "2026-10-02", source: "import",
    }).returning();
    const ok = await as(a).patch(`/api/v1/transactions/${imported.id}`, { categoryId: await categoryId("eat.cafe") });
    expect(ok.body.transaction).toMatchObject({ categorySource: "manual" });
    const refused = await as(a).patch(`/api/v1/transactions/${imported.id}`, { amount: "1" });
    expect([refused.status, refused.body.error.code]).toEqual([409, "OPERATION_NOT_ALLOWED"]);
  });
});

describe("массовые действия", () => {
  it("категория для нескольких операций одним запросом", async () => {
    const acc = await account(a);
    const ids = [(await spend(a, acc.id)).id, (await spend(a, acc.id)).id, (await spend(a, acc.id)).id];
    const res = await as(a).post("/api/v1/transactions/bulk", { ids, action: "set_category", categoryId: await categoryId("home.goods") });
    expect(res.body).toEqual({ updated: 3 });
    const rows = await db.select().from(transactions).where(eq(transactions.accountId, acc.id));
    expect(rows.every((row) => row.categorySource === "manual")).toBe(true);
  });

  it("если среди id есть чужой — 404 и ничего не меняется", async () => {
    const mine = await spend(a, (await account(a)).id);
    const theirs = await spend(b, (await account(b)).id);
    const res = await as(a).post("/api/v1/transactions/bulk", { ids: [mine.id, theirs.id], action: "delete" });
    expect(res.status).toBe(404);
    expect((await as(a).get(`/api/v1/transactions/${mine.id}`)).status).toBe(200);
    expect((await as(b).get(`/api/v1/transactions/${theirs.id}`)).status).toBe(200);
  });

  it("исключение из статистики и обратно", async () => {
    const tx = await spend(a, (await account(a)).id);
    await as(a).post("/api/v1/transactions/bulk", { ids: [tx.id], action: "exclude" });
    expect((await as(a).get(`/api/v1/transactions/${tx.id}`)).body.excludeFromStats).toBe(true);
    await as(a).post("/api/v1/transactions/bulk", { ids: [tx.id], action: "include" });
    expect((await as(a).get(`/api/v1/transactions/${tx.id}`)).body.excludeFromStats).toBe(false);
  });
});

describe("переводы", () => {
  it("перевод — две операции transfer с общей группой, остатки меняются, удаление одной ноги удаляет обе", async () => {
    const from = await account(a, { openingBalance: "10000" });
    const to = await account(a, { kind: "savings" });
    const res = await as(a).post("/api/v1/transfers", { fromAccountId: from.id, toAccountId: to.id, amount: "3000", date: "2026-10-09", note: "в копилку" });
    expect(res.status).toBe(201);
    expect(res.body.from).toMatchObject({ type: "transfer", amount: "-3000.00", transferCounterpartAccountId: to.id, categorySource: "transfer", note: "в копилку" });
    expect(res.body.to).toMatchObject({ type: "transfer", amount: "3000.00", transferCounterpartAccountId: from.id, transferGroupId: res.body.transferGroupId });
    expect([await balance(a, from.id), await balance(a, to.id)]).toEqual(["7000.00", "3000.00"]);

    await as(a).delete(`/api/v1/transactions/${res.body.to.id}`);
    expect((await as(a).get(`/api/v1/transactions/${res.body.from.id}`)).status).toBe(404);
    expect([await balance(a, from.id), await balance(a, to.id)]).toEqual(["10000.00", "0.00"]);
  });

  it("между валютами нужна сумма зачисления: 100 USD → 9 150 ₽", async () => {
    const usd = await account(a, { currency: "USD", openingBalance: "500" });
    const rub = await account(a);
    const missing = await as(a).post("/api/v1/transfers", { fromAccountId: usd.id, toAccountId: rub.id, amount: "100", date: "2026-10-09" });
    expect([missing.status, missing.body.error.code]).toEqual([400, "VALIDATION_ERROR"]);

    await db.insert(fxRates).values({ date: "2026-10-08", currency: "USD", rateRub: "91.500000" }).onConflictDoNothing();
    const res = await as(a).post("/api/v1/transfers", { fromAccountId: usd.id, toAccountId: rub.id, amount: "100", toAmount: "9150", date: "2026-10-09" });
    expect(res.body.from).toMatchObject({ amount: "-100.00", currency: "USD", amountRub: "-9150.00" });
    expect(res.body.to).toMatchObject({ amount: "9150.00", currency: "RUB" });
  });

  it("один и тот же счёт — 400, архивный — 409, повтор по id — без дубля", async () => {
    const acc = await account(a);
    expect((await as(a).post("/api/v1/transfers", { fromAccountId: acc.id, toAccountId: acc.id, amount: "1", date: "2026-10-09" })).status).toBe(400);
    const archived = await account(a);
    await as(a).post(`/api/v1/accounts/${archived.id}/archive`);
    expect((await as(a).post("/api/v1/transfers", { fromAccountId: acc.id, toAccountId: archived.id, amount: "1", date: "2026-10-09" })).status).toBe(409);

    const other = await account(a);
    const id = randomUUID();
    const body = { id, fromAccountId: acc.id, toAccountId: other.id, amount: "10", date: "2026-10-09" };
    expect((await as(a).post("/api/v1/transfers", body)).status).toBe(201);
    expect((await as(a).post("/api/v1/transfers", body)).status).toBe(200);
    expect(await db.select().from(transactions).where(eq(transactions.transferGroupId, id))).toHaveLength(2);
  });

  it("расход и доход в разных счетах связываются в перевод и разрываются обратно", async () => {
    const card = await account(a);
    const savings = await account(a, { kind: "savings" });
    const out = await spend(a, card.id, { amount: "700" });
    const inc = (await as(a).post("/api/v1/transactions", { accountId: savings.id, type: "income", amount: "700", date: "2026-10-10" })).body;

    const link = await as(a).post("/api/v1/transfers/link", { outgoingId: out.id, incomingId: inc.id });
    expect(link.status).toBe(200);
    expect((await as(a).get(`/api/v1/transactions/${out.id}`)).body).toMatchObject({ type: "transfer", transferGroupId: link.body.transferGroupId, transferCounterpartAccountId: savings.id });
    expect((await as(a).post("/api/v1/transfers/link", { outgoingId: out.id, incomingId: inc.id })).status).toBe(409);

    expect((await as(a).delete(`/api/v1/transfers/${link.body.transferGroupId}?keepTransactions=true`)).status).toBe(204);
    expect((await as(a).get(`/api/v1/transactions/${out.id}`)).body).toMatchObject({ type: "expense", transferGroupId: null });
    expect((await as(a).get(`/api/v1/transactions/${inc.id}`)).body).toMatchObject({ type: "income", transferGroupId: null });
  });

  it("нельзя связать два расхода или операции одного счёта", async () => {
    const card = await account(a);
    const other = await account(a);
    const first = await spend(a, card.id);
    const second = await spend(a, other.id);
    expect((await as(a).post("/api/v1/transfers/link", { outgoingId: first.id, incomingId: second.id })).status).toBe(409);
    const inc = (await as(a).post("/api/v1/transactions", { accountId: card.id, type: "income", amount: "100", date: "2026-10-10" })).body;
    expect((await as(a).post("/api/v1/transfers/link", { outgoingId: first.id, incomingId: inc.id })).status).toBe(409);
  });

  it("подсказывает пары с одинаковой суммой и словом «перевод», без лишних", async () => {
    const user = await registerUser();
    const card = await account(user, { lastFour: "4321" });
    const savings = await account(user, { kind: "savings" });
    const today = new Date();
    const day = (offset: number) => new Date(today.getTime() - offset * 86_400_000).toISOString().slice(0, 10);
    await spend(user, card.id, { amount: "500", date: day(2), description: "Перевод на накопительный счёт" });
    await as(user).post("/api/v1/transactions", { accountId: savings.id, type: "income", amount: "500", date: day(1), description: "Пополнение" });
    await spend(user, card.id, { amount: "777", date: day(1), description: "Магазин" });
    await as(user).post("/api/v1/transactions", { accountId: savings.id, type: "income", amount: "777", date: day(1), description: "Кешбэк" });

    const res = await as(user).get("/api/v1/transfers/suggestions");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ outgoing: { amount: "-500.00" }, incoming: { amount: "500.00" }, score: 0.85 });
  });
});

describe("права: пользователь B не видит и не меняет операции и переводы A", () => {
  let accountA: { id: string };
  let txA: { id: string };
  let transferA: { transferGroupId: string; from: { id: string }; to: { id: string } };
  beforeAll(async () => {
    accountA = await account(a, { openingBalance: "1000" });
    const savingsA = await account(a);
    txA = await spend(a, accountA.id, { merchant: "Секретная покупка" });
    transferA = (await as(a).post("/api/v1/transfers", { fromAccountId: accountA.id, toAccountId: savingsA.id, amount: "10", date: "2026-10-10" })).body;
  });

  it("B не видит операции A в ленте и итогах", async () => {
    const ids = (await as(b).get("/api/v1/transactions?limit=200")).body.items.map((item: { id: string }) => item.id);
    expect(ids).not.toContain(txA.id);
    expect((await as(b).get(`/api/v1/transactions/summary?accountId=${accountA.id}`)).body.count).toBe(0);
  });

  it.each([
    ["GET операции", () => as(b).get(`/api/v1/transactions/${txA.id}`)],
    ["PATCH операции", () => as(b).patch(`/api/v1/transactions/${txA.id}`, { note: "взлом" })],
    ["DELETE операции", () => as(b).delete(`/api/v1/transactions/${txA.id}`)],
    ["bulk с операцией A", () => as(b).post("/api/v1/transactions/bulk", { ids: [txA.id], action: "delete" })],
    ["операция в счёте A", () => as(b).post("/api/v1/transactions", { accountId: accountA.id, type: "expense", amount: "1", date: "2026-10-10" })],
    ["перевод из счёта A", async () => as(b).post("/api/v1/transfers", { fromAccountId: accountA.id, toAccountId: (await account(b)).id, amount: "1", date: "2026-10-10" })],
    ["связать операции A", () => as(b).post("/api/v1/transfers/link", { outgoingId: txA.id, incomingId: transferA.to.id })],
    ["разорвать перевод A", () => as(b).delete(`/api/v1/transfers/${transferA.transferGroupId}`)],
  ])("%s → 404", async (_title, call) => {
    const res = await call();
    expect(res.status).toBe(404);
  });

  it("данные A не изменились", async () => {
    expect((await as(a).get(`/api/v1/transactions/${txA.id}`)).body).toMatchObject({ merchant: "Секретная покупка", note: null });
    expect((await as(a).get(`/api/v1/transactions/${transferA.from.id}`)).body.transferGroupId).toBe(transferA.transferGroupId);
    expect(await balance(a, accountA.id)).toBe("890.00");
  });
});
