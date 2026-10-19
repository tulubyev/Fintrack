/**
 * Предупреждения о порогах бюджета (E1.4-T3): по одному уведомлению на бюджет, месяц и порог, повтор не дублирует,
 * проверка ставится после записи операции и выполняется воркером за секунды.
 */
import { randomUUID } from "node:crypto";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { and, eq, inArray } from "drizzle-orm";
import { db, budgetAlerts, categories, notifications } from "@workspace/db";
import { jobsBoss, startJobs, stopJobs } from "../src/jobs";
import { jobDefinitions } from "../src/jobs/definitions";
import { BUDGET_CHECK_JOB, checkBudgetAlerts, scheduleBudgetCheck } from "../src/services/budgetAlertService";
import { currentMonth, todayMsk } from "../src/services/budgetService";
import { app, auth, registerUser, type TestUser } from "./helpers";

afterEach(async () => {
  await stopJobs(2_000);
});

const THIS = currentMonth();
const TODAY = todayMsk();
const PREV = new Date(Date.UTC(Number(THIS.slice(0, 4)), Number(THIS.slice(5, 7)) - 2, 1)).toISOString().slice(0, 7);

const code = async (value: string) => (await db.select().from(categories).where(eq(categories.code, value)))[0].id;
const post = (user: TestUser, url: string, body: object) => request(app).post(url).set(auth(user.token)).send(body);

async function setup() {
  const user = await registerUser();
  const acc = await post(user, "/api/v1/accounts", { name: `Карта ${randomUUID().slice(0, 6)}`, kind: "debit_card", openingBalance: "500000.00", openingBalanceDate: `${PREV}-01` });
  expect(acc.status).toBe(201);
  return { user, accountId: acc.body.id as string };
}

async function budget(user: TestUser, body: object) {
  const res = await post(user, "/api/v1/budgets", { fromMonth: PREV, ...body });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.id as string;
}

async function spend(user: TestUser, accountId: string, categoryId: string, amount: string, date = TODAY) {
  const res = await post(user, "/api/v1/transactions", { type: "expense", accountId, categoryId, amount, date });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
}

const alertsOf = (userId: string) => db.select().from(notifications)
  .where(and(eq(notifications.userId, userId), eq(notifications.type, "budget_threshold"))).orderBy(notifications.createdAt);
const thresholdsOf = async (budgetId: string) => (await db.select().from(budgetAlerts).where(eq(budgetAlerts.budgetId, budgetId)))
  .map((row) => [row.periodStart, row.threshold]).sort();

async function waitFor(check: () => Promise<boolean>, timeoutMs: number): Promise<number> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await check()) return Date.now() - started;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Условие не выполнилось за ${timeoutMs} мс`);
}

describe("пороги бюджета", () => {
  it("80%, затем 100%: по одному уведомлению, повторная проверка ничего не добавляет", async () => {
    const { user, accountId } = await setup();
    const food = await code("food");
    const id = await budget(user, { categoryId: food, amount: "10000" });

    await spend(user, accountId, food, "7000");
    expect(await checkBudgetAlerts(user.id)).toBe(0);

    await spend(user, accountId, food, "1500");
    expect(await checkBudgetAlerts(user.id)).toBe(1);
    expect(await checkBudgetAlerts(user.id)).toBe(0);
    let alerts = await alertsOf(user.id);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      title: "Бюджет «Продукты»: 85%",
      body: "Потрачено 8 500 ₽ из 10 000 ₽, осталось 1 500 ₽ до конца месяца",
      deepLink: `/budgets?month=${THIS}`,
      dedupKey: `budget:${id}:${THIS}:80`,
    });

    await spend(user, accountId, food, "2000.50");
    expect(await checkBudgetAlerts(user.id)).toBe(1);
    alerts = await alertsOf(user.id);
    expect(alerts).toHaveLength(2);
    expect(alerts[1]).toMatchObject({
      title: "Бюджет «Продукты» превышен",
      body: "Потрачено 10 500,50 ₽ из 10 000 ₽, перерасход 500,50 ₽",
      dedupKey: `budget:${id}:${THIS}:100`,
    });
    expect(await thresholdsOf(id)).toEqual([[`${THIS}-01`, 100], [`${THIS}-01`, 80]].sort());
    expect(await checkBudgetAlerts(user.id)).toBe(0);
  });

  it("покупка сразу за 100%: одно уведомление «превышен», оба порога отмечены; возврат и новая трата не повторяют", async () => {
    const { user, accountId } = await setup();
    const transport = await code("transport");
    const id = await budget(user, { categoryId: transport, amount: "1000" });

    await spend(user, accountId, transport, "1500");
    expect(await checkBudgetAlerts(user.id)).toBe(1);
    expect((await alertsOf(user.id)).map((n) => n.dedupKey)).toEqual([`budget:${id}:${THIS}:100`]);
    expect(await thresholdsOf(id)).toEqual([[`${THIS}-01`, 100], [`${THIS}-01`, 80]].sort());

    // возврат опускает до 50%, новая трата снова за 100% — пороги этого месяца уже пройдены
    expect((await post(user, "/api/v1/transactions", { type: "income", accountId, categoryId: transport, amount: "1000", date: TODAY })).status).toBe(201);
    await spend(user, accountId, transport, "1500");
    expect(await checkBudgetAlerts(user.id)).toBe(0);
    expect(await alertsOf(user.id)).toHaveLength(1);
  });

  it("общий бюджет, бюджет подкатегории внутри родителя и свои пороги", async () => {
    const { user, accountId } = await setup();
    const food = await code("food");
    const groceries = await code("food.groceries");
    const total = await budget(user, { categoryId: null, amount: "20000", alertThresholds: [50] });
    await budget(user, { categoryId: food, amount: "30000" });
    const child = await budget(user, { categoryId: groceries, amount: "5000" });

    await spend(user, accountId, groceries, "10000");
    expect(await checkBudgetAlerts(user.id)).toBe(2);
    const alerts = await alertsOf(user.id);
    expect(alerts.map((n) => n.dedupKey).sort()).toEqual([`budget:${child}:${THIS}:100`, `budget:${total}:${THIS}:50`].sort());
    expect(alerts.find((n) => n.dedupKey!.startsWith(`budget:${total}`))!.title).toBe("Общий бюджет: 50%");
  });

  it("траты прошлого месяца не будят: проверяется только текущий", async () => {
    const { user, accountId } = await setup();
    const food = await code("food");
    await budget(user, { categoryId: food, amount: "1000" });
    await spend(user, accountId, food, "5000", `${PREV}-15`);
    expect(await checkBudgetAlerts(user.id)).toBe(0);
    expect(await alertsOf(user.id)).toHaveLength(0);
  });

  it("проверка B не трогает бюджеты и уведомления A", async () => {
    const { user: a, accountId } = await setup();
    const { user: b } = await setup();
    const food = await code("food");
    const id = await budget(a, { categoryId: food, amount: "1000" });
    await spend(a, accountId, food, "900");

    expect(await checkBudgetAlerts(b.id)).toBe(0);
    expect(await alertsOf(a.id)).toHaveLength(0);
    expect(await thresholdsOf(id)).toEqual([]);
    expect(await alertsOf(b.id)).toHaveLength(0);
  });
});

describe("задача budgets.check", () => {
  const definition = jobDefinitions.find((job) => job.name === BUDGET_CHECK_JOB)!;

  // createQueue не меняет политику готовой очереди: пересоздаём, чтобы проверять опции из определения
  beforeAll(async () => {
    await startJobs("off", []);
    await jobsBoss()!.deleteQueue(BUDGET_CHECK_JOB);
    await stopJobs();
  });

  it("очередь создаётся с политикой stately", async () => {
    await startJobs("off", [definition]);
    expect((await jobsBoss()!.getQueue(BUDGET_CHECK_JOB))?.policy).toBe("stately");
  });

  it("на пользователя в очереди не больше одной проверки", async () => {
    const { user } = await setup();
    await startJobs("off", [definition]);
    await scheduleBudgetCheck(user.id);
    await scheduleBudgetCheck(user.id);
    const jobs = await jobsBoss()!.findJobs(BUDGET_CHECK_JOB, { key: user.id });
    expect(jobs.filter((job) => job.state === "created")).toHaveLength(1);
  });

  it("операция через API → воркер присылает уведомление за секунды", async () => {
    const { user, accountId } = await setup();
    const food = await code("food");
    await budget(user, { categoryId: food, amount: "1000" });

    await startJobs("both", [definition]);
    await spend(user, accountId, food, "850");
    const elapsed = await waitFor(async () => (await alertsOf(user.id)).length === 1, 20_000);
    expect(elapsed).toBeLessThan(20_000);
    expect((await alertsOf(user.id))[0].title).toBe("Бюджет «Продукты»: 85%");
  });

  it("без запущенной очереди запись операции проходит", async () => {
    const { user, accountId } = await setup();
    const food = await code("food");
    await budget(user, { categoryId: food, amount: "1000" });
    await spend(user, accountId, food, "2000");
    const ids = (await db.select({ id: notifications.id }).from(notifications).where(inArray(notifications.userId, [user.id])));
    expect(ids).toHaveLength(0);
  });
});
