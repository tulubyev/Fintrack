/**
 * Аналитика (E1.5-T2): траты и доходы по категориям, родителям и периодам с возвратами и без переводов,
 * фильтры по счёту и категории, согласованность со сводкой главной, денежный поток по месяцам, ошибки ввода, права.
 */
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { db, categories } from "@workspace/db";
import { todayMsk } from "../src/services/recurring/recurringService";
import { app, auth, registerUser, type TestUser } from "./helpers";

const TODAY = todayMsk();
const MONTH = TODAY.slice(0, 7);
const shiftMonth = (month: string, delta: number) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
};
const PREV = shiftMonth(MONTH, -1);
const code = async (value: string) => (await db.select().from(categories).where(eq(categories.code, value)))[0].id;
const get = (user: TestUser, url: string) => request(app).get(url).set(auth(user.token));
const post = (user: TestUser, url: string, body: object) => request(app).post(url).set(auth(user.token)).send(body);

let a: TestUser;
let card: string;
let cash: string;
let ids: Record<string, string>;
const PERIOD = `from=${PREV}-01&to=${TODAY}`;

beforeAll(async () => {
  a = await registerUser();
  const account = async (kind: string) => (await post(a, "/api/v1/accounts", { name: `${kind} ${randomUUID().slice(0, 4)}`, kind, openingBalance: "100000.00", openingBalanceDate: `${shiftMonth(MONTH, -3)}-01` })).body.id;
  card = await account("debit_card");
  cash = await account("cash");
  ids = Object.fromEntries(await Promise.all(["food", "food.groceries", "eat", "inc.salary"].map(async (c) => [c, await code(c)])));
  const tx = async (body: object) => expect((await post(a, "/api/v1/transactions", body)).status).toBe(201);
  await tx({ type: "expense", accountId: card, categoryId: ids["food.groceries"], amount: "3000", date: `${MONTH}-01` });
  await tx({ type: "expense", accountId: cash, categoryId: ids.food, amount: "1000", date: `${MONTH}-01` });
  await tx({ type: "income", accountId: card, categoryId: ids["food.groceries"], amount: "500", description: "Возврат", date: `${MONTH}-01` });
  await tx({ type: "expense", accountId: card, categoryId: ids.eat, amount: "2000", date: `${PREV}-10` });
  await tx({ type: "expense", accountId: card, amount: "300", description: "Без категории", date: `${PREV}-11` });
  await tx({ type: "income", accountId: card, categoryId: ids["inc.salary"], amount: "90000", date: `${PREV}-05` });
  await tx({ type: "income", accountId: card, amount: "1000", description: "Перевод от друга", date: `${MONTH}-01` });
  await post(a, "/api/v1/transfers", { fromAccountId: card, toAccountId: cash, amount: "5000", date: `${MONTH}-01` });
});

describe("GET /api/v1/analytics/spending", () => {
  it("по родительским категориям: подкатегория в родителе, возврат уменьшает, без переводов, по убыванию", async () => {
    const res = await get(a, `/api/v1/analytics/spending?${PERIOD}&groupBy=parent_category`);
    expect(res.status).toBe(200);
    expect(res.body.items.map((i: { label: string; amount: string }) => [i.label, i.amount])).toEqual([
      ["Продукты", "3500.00"], ["Кафе и рестораны", "2000.00"], ["Без категории", "300.00"],
    ]);
    expect(res.body.total).toBe("5800.00");
    expect(res.body.items[0]).toMatchObject({ key: ids.food, count: 3 });
  });

  it("по категориям: подкатегория отдельно с полным названием", async () => {
    const res = await get(a, `/api/v1/analytics/spending?${PERIOD}&groupBy=category`);
    expect(res.body.items.find((i: { key: string }) => i.key === ids["food.groceries"])).toMatchObject({ label: expect.stringMatching(/^Продукты · /), amount: "2500.00" });
  });

  it("по месяцам и дням; доходы: зарплата и доход без категории, возврат не доход", async () => {
    const months = await get(a, `/api/v1/analytics/spending?${PERIOD}&groupBy=month`);
    expect(months.body.items).toMatchObject([{ key: PREV, amount: "2300.00" }, { key: MONTH, amount: "3500.00" }]);
    const days = await get(a, `/api/v1/analytics/spending?${PERIOD}&groupBy=day`);
    expect(days.body.items.map((i: { key: string }) => i.key)).toEqual([`${PREV}-10`, `${PREV}-11`, `${MONTH}-01`]);
    const income = await get(a, `/api/v1/analytics/spending?${PERIOD}&groupBy=month&type=income`);
    expect(income.body).toMatchObject({ items: [{ key: PREV, amount: "90000.00" }, { key: MONTH, amount: "1000.00" }], total: "91000.00" });
  });

  it("фильтры по счёту и категории (с подкатегориями)", async () => {
    const byCash = await get(a, `/api/v1/analytics/spending?${PERIOD}&accountId=${cash}`);
    expect(byCash.body.total).toBe("1000.00");
    const byFood = await get(a, `/api/v1/analytics/spending?${PERIOD}&groupBy=month&categoryId=${ids.food}`);
    expect(byFood.body.total).toBe("3500.00");
  });

  it("за текущий месяц совпадает с топом категорий на главной", async () => {
    const analytics = await get(a, `/api/v1/analytics/spending?from=${MONTH}-01&to=${TODAY}&groupBy=parent_category`);
    const dashboard = await get(a, "/api/v1/dashboard/summary");
    expect(analytics.body.total).toBe(dashboard.body.topCategories.total);
    expect(analytics.body.items[0].amount).toBe(dashboard.body.topCategories.items[0].amount);
  });

  it("ошибки: нет дат, конец раньше начала, больше 3 лет, неизвестная группировка и тип, не uuid", async () => {
    expect((await get(a, "/api/v1/analytics/spending")).status).toBe(400);
    expect((await get(a, `/api/v1/analytics/spending?from=${TODAY}&to=${PREV}-01`)).status).toBe(400);
    expect((await get(a, "/api/v1/analytics/spending?from=2020-01-01&to=2023-12-31")).status).toBe(400);
    expect((await get(a, `/api/v1/analytics/spending?${PERIOD}&groupBy=year`)).status).toBe(400);
    expect((await get(a, `/api/v1/analytics/spending?${PERIOD}&type=transfer`)).status).toBe(400);
    expect((await get(a, `/api/v1/analytics/spending?${PERIOD}&accountId=abc`)).status).toBe(400);
  });
});

describe("GET /api/v1/analytics/cashflow", () => {
  it("последние месяцы по порядку, пустые — нулями, доходы и траты как в итогах операций", async () => {
    const res = await get(a, "/api/v1/analytics/cashflow?months=3");
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([
      { month: shiftMonth(MONTH, -2), income: "0.00", expense: "0.00", net: "0.00" },
      { month: PREV, income: "90000.00", expense: "2300.00", net: "87700.00" },
      { month: MONTH, income: "1000.00", expense: "3500.00", net: "-2500.00" }, // возврат 500 — не доход, а минус траты
    ]);
    const ops = await get(a, `/api/v1/transactions/summary?from=${MONTH}-01&to=${TODAY}`);
    expect(res.body.items[2]).toMatchObject({ income: ops.body.income, expense: ops.body.expense });
    expect((await get(a, "/api/v1/analytics/cashflow")).body.items).toHaveLength(6);
    expect((await get(a, "/api/v1/analytics/cashflow?months=25")).status).toBe(400);
  });
});

describe("права", () => {
  it("B не видит трат A, даже с фильтром по счёту A", async () => {
    const b = await registerUser();
    expect((await get(b, `/api/v1/analytics/spending?${PERIOD}`)).body).toEqual({ items: [], total: "0.00" });
    expect((await get(b, `/api/v1/analytics/spending?${PERIOD}&accountId=${card}`)).body.total).toBe("0.00");
    expect((await get(b, "/api/v1/analytics/cashflow?months=2")).body.items.every((i: { income: string; expense: string }) => i.income === "0.00" && i.expense === "0.00")).toBe(true);
  });
});
