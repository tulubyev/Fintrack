/**
 * Сводка главного экрана (E1.5-T1): пустой пользователь, месяц против того же периода прошлого месяца и совпадение
 * с итогами экрана операций, топ родительских категорий с возвратами и «Остальным», бюджеты, ближайшие списания,
 * свежесть импортных счетов, онбординг и «Скрыть», ошибки ввода, права.
 */
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { eq, sql } from "drizzle-orm";
import { db, categories, transactions } from "@workspace/db";
import { addDays, addMonths } from "../src/services/recurring/detector";
import { detectForUser, todayMsk } from "../src/services/recurring/recurringService";
import { app, auth, registerUser, type TestUser } from "./helpers";

const TODAY = todayMsk();
const MONTH = TODAY.slice(0, 7);
const DAY = Number(TODAY.slice(8, 10));
const shiftMonth = (month: string, delta: number) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
};
const PREV = shiftMonth(MONTH, -1);
const daysIn = (month: string) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
const day = (month: string, n: number) => `${month}-${String(n).padStart(2, "0")}`;
const code = async (value: string) => (await db.select().from(categories).where(eq(categories.code, value)))[0].id;

const as = (user: TestUser) => ({
  get: (url: string) => request(app).get(url).set(auth(user.token)),
  post: (url: string, body?: object) => request(app).post(url).set(auth(user.token)).send(body ?? {}),
});

async function account(user: TestUser, body: Record<string, unknown> = {}) {
  const res = await as(user).post("/api/v1/accounts", {
    name: `Карта ${randomUUID().slice(0, 6)}`, kind: "debit_card", openingBalance: "100000.00", openingBalanceDate: day(shiftMonth(MONTH, -3), 1), ...body,
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.id as string;
}

async function tx(user: TestUser, body: Record<string, unknown>) {
  const res = await as(user).post("/api/v1/transactions", body);
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.id as string;
}

describe("пустой пользователь", () => {
  it("нули, пустые блоки и онбординг без выполненных шагов; «Скрыть» запоминается", async () => {
    const user = await registerUser();
    const res = await as(user).get("/api/v1/dashboard/summary");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      month: MONTH, asOf: TODAY,
      balance: { totalRub: "0.00", accountsCount: 0 },
      period: { income: "0.00", expense: "0.00", expensePrevSamePeriod: "0.00", expenseDeltaPct: null, daysPassed: DAY },
      topCategories: { items: [], other: null },
      budgets: null,
      upcoming: { items: [], total: "0.00" },
      goals: [],
      uncategorizedCount: 0,
      freshness: [],
      onboarding: { hasAccount: false, hasTransactions: false, txCount: 0, hasBudget: false, dismissed: false },
    });
    expect(Date.parse(res.body.onboarding.signedUpAt)).toBeGreaterThan(Date.now() - 60_000);
    expect((await as(user).post("/api/v1/dashboard/onboarding/dismiss")).status).toBe(204);
    expect((await as(user).get("/api/v1/dashboard/summary")).body.onboarding.dismissed).toBe(true);
  });

  it("месяц — ГГГГ-ММ и не из будущего", async () => {
    const user = await registerUser();
    expect((await as(user).get("/api/v1/dashboard/summary?month=2026-13")).status).toBe(400);
    expect((await as(user).get(`/api/v1/dashboard/summary?month=${shiftMonth(MONTH, 1)}`)).status).toBe(400);
    expect((await as(user).get(`/api/v1/dashboard/summary?month=${PREV}`)).body.period.daysPassed).toBe(daysIn(PREV));
  });
});

describe("месяц и категории", () => {
  let a: TestUser;
  let card: string;
  let summary: any;

  beforeAll(async () => {
    a = await registerUser();
    card = await account(a);
    const saving = await account(a, { kind: "savings", openingBalance: "50000.00" });
    const [food, groceries, eat, transport, home, health, clothes, salary] = await Promise.all(
      ["food", "food.groceries", "eat", "transport", "home", "health", "clothes", "inc.salary"].map(code),
    );
    const d = (n: number) => day(MONTH, Math.min(n, DAY));
    // этот месяц: продукты 10 000 (подкатегория + родитель), возврат 1 000; ещё 5 категорий и операция без категории
    await tx(a, { type: "expense", accountId: card, categoryId: groceries, amount: "6000", date: d(1) });
    await tx(a, { type: "expense", accountId: card, categoryId: food, amount: "4000", date: d(1) });
    await tx(a, { type: "income", accountId: card, categoryId: groceries, amount: "1000", description: "Возврат", date: d(1) });
    await tx(a, { type: "expense", accountId: card, categoryId: eat, amount: "5000", date: d(1) });
    await tx(a, { type: "expense", accountId: card, categoryId: transport, amount: "3000", date: d(1) });
    await tx(a, { type: "expense", accountId: card, categoryId: home, amount: "2000", date: d(1) });
    await tx(a, { type: "expense", accountId: card, categoryId: health, amount: "1000", date: d(1) });
    await tx(a, { type: "expense", accountId: card, categoryId: clothes, amount: "500", date: d(1) });
    await tx(a, { type: "expense", accountId: card, amount: "700", description: "Что-то", date: d(1) });
    await tx(a, { type: "income", accountId: card, categoryId: salary, amount: "100000", date: d(1) });
    // перевод между своими счетами — не трата
    await as(a).post("/api/v1/transfers", { fromAccountId: card, toAccountId: saving, amount: "20000", date: d(1) });
    // прошлый месяц: тот же период — продукты 8 000; после этого дня — 50 000, не должны попасть в сравнение
    await tx(a, { type: "expense", accountId: card, categoryId: food, amount: "8000", date: day(PREV, 1) });
    if (DAY < daysIn(PREV)) await tx(a, { type: "expense", accountId: card, categoryId: food, amount: "50000", date: day(PREV, DAY + 1) });
    summary = (await as(a).get("/api/v1/dashboard/summary")).body;
  });

  it("траты и доходы месяца совпадают с итогами экрана операций за тот же период", async () => {
    const ops = await as(a).get(`/api/v1/transactions/summary?from=${day(MONTH, 1)}&to=${TODAY}`);
    expect(summary.period).toMatchObject({ income: ops.body.income, expense: ops.body.expense, net: ops.body.net });
    expect(summary.period).toMatchObject({ income: "101000.00", expense: "22200.00" });
  });

  it("сравнение — с тем же числом дней прошлого месяца", () => {
    expect(summary.period.expensePrevSamePeriod).toBe("8000.00");
    expect(summary.period.expenseDeltaPct).toBe(177.5); // 22 200 против 8 000
  });

  it("топ-5 родительских категорий: подкатегории в родителе, возврат уменьшает, без переводов; остальное отдельно", () => {
    const top = summary.topCategories;
    expect(top.items.map((item: { name: string }) => item.name)).toEqual(["Продукты", "Кафе и рестораны", "Транспорт", "Жильё", "Здоровье"]);
    expect(top.items[0]).toMatchObject({ amount: "9000.00", deltaPct: 12.5 }); // 10 000 − 1 000 возврат против 8 000
    expect(top.other).toMatchObject({ amount: "1200.00" }); // одежда 500 + без категории 700
    expect(top.total).toBe("21200.00");
    expect(top.items.reduce((sum: number, item: { share: number }) => sum + item.share, 0) + top.other.share).toBeCloseTo(1, 2);
  });

  it("баланс по счетам в рублях, без категории — 1, онбординг: счёт и операции есть, бюджета нет", () => {
    // 150 000 начальных + 101 000 − 22 200 − 8 000 и ещё − 50 000, если в прошлом месяце был день после сегодняшнего
    const expected = DAY < daysIn(PREV) ? "170800.00" : "220800.00";
    expect(summary.balance).toMatchObject({ totalRub: expected, accountsCount: 2 });
    expect(summary.uncategorizedCount).toBe(1);
    expect(summary.onboarding).toMatchObject({ hasAccount: true, hasTransactions: true, hasBudget: false });
  });

  it("бюджеты: число, перерасход и три самых заполненных", async () => {
    await as(a).post("/api/v1/budgets", { categoryId: await code("eat"), amount: "4000" });
    await as(a).post("/api/v1/budgets", { categoryId: await code("transport"), amount: "10000" });
    const res = await as(a).get("/api/v1/dashboard/summary");
    expect(res.body.budgets).toMatchObject({ count: 2, over: 1 });
    expect(res.body.budgets.top[0].category.name).toBe("Кафе и рестораны");
    expect(res.body.onboarding.hasBudget).toBe(true);
  });

  it("B не видит данных A", async () => {
    const b = await registerUser();
    const res = await as(b).get("/api/v1/dashboard/summary");
    expect(res.body).toMatchObject({ balance: { totalRub: "0.00", accountsCount: 0 }, period: { expense: "0.00" }, budgets: null, uncategorizedCount: 0, freshness: [] });
    expect(res.body.topCategories.items).toEqual([]);
  });
});

describe("ближайшие списания и свежесть", () => {
  it("списания на 14 дней из регулярных платежей; импортный счёт без операций > 14 дней — устарел", async () => {
    const user = await registerUser();
    const card = await account(user);
    for (let i = 3; i >= 0; i--) await tx(user, { type: "expense", accountId: card, amount: "299", description: "YANDEX PLUS", date: addMonths(addDays(TODAY, -25), -i) });
    await detectForUser(user.id);
    const res = await as(user).get("/api/v1/dashboard/summary");
    expect(res.body.upcoming.items).toMatchObject([{ name: "Яндекс Плюс", amount: "299.00", date: addMonths(addDays(TODAY, -25), 1) }]);
    expect(res.body.upcoming.total).toBe("299.00");
    expect(res.body.freshness).toMatchObject([{ accountId: card, source: "manual", stale: false }]);

    // те же операции, но из выписки: последняя 25 дней назад → данные устарели
    await db.update(transactions).set({ source: "import" }).where(eq(transactions.accountId, card));
    const stale = await as(user).get("/api/v1/dashboard/summary");
    expect(stale.body.freshness).toMatchObject([{ accountId: card, source: "import", stale: true, lastTransactionDate: addDays(TODAY, -25) }]);
  });
});

describe("скорость", () => {
  it("20 000 операций за 400 дней — сводка быстрее 300 мс (медиана из 5 запросов)", async () => {
    const user = await registerUser();
    const card = await account(user, { openingBalanceDate: addDays(TODAY, -500) });
    const leaves = await db.select({ id: categories.id }).from(categories).where(sql`${categories.code} like 'food.%' or ${categories.code} like 'eat.%' or ${categories.code} like 'transport.%'`);
    const ids = sql.raw(`ARRAY[${leaves.map((row) => `'${row.id}'::uuid`).join(",")}]`);
    await db.execute(sql`
      INSERT INTO ${transactions} (user_id, account_id, amount, amount_rub, currency, description, transaction_date, local_date, type, category_id)
      SELECT ${user.id}, ${card}, -(100 + n % 900), -(100 + n % 900), 'RUB', 'Покупка ' || n,
             (${TODAY}::date - (n % 400))::timestamp, ${TODAY}::date - (n % 400), 'expense', (${ids})[1 + n % ${leaves.length}]
      FROM generate_series(1, 20000) n
    `);
    await as(user).get("/api/v1/dashboard/summary"); // прогрев
    const times: number[] = [];
    for (let i = 0; i < 5; i++) {
      const started = performance.now();
      const res = await as(user).get("/api/v1/dashboard/summary");
      times.push(performance.now() - started);
      expect(res.body.onboarding.txCount).toBe(20000);
    }
    times.sort((x, y) => x - y);
    console.log(`dashboard summary, 20 000 операций: ${times.map((t) => Math.round(t)).join(", ")} мс`);
    expect(times[2]).toBeLessThan(300);
  });
});
