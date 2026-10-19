/**
 * Бюджеты v2 (E1.4-T1/T2) по критериям приёмки эпика: исполнение по поддереву с возвратами, версии по месяцам,
 * перенос остатка, общий бюджет, «без бюджета», предложения по медиане, права.
 */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { db, budgets, categories } from "@workspace/db";
import { currentMonth, todayMsk } from "../src/services/budgetService";
import { app, auth, registerUser, type TestUser } from "./helpers";

const as = (user: TestUser) => ({
  get: (url: string) => request(app).get(url).set(auth(user.token)),
  post: (url: string, body?: object) => request(app).post(url).set(auth(user.token)).send(body ?? {}),
  patch: (url: string, body: object) => request(app).patch(url).set(auth(user.token)).send(body),
  delete: (url: string) => request(app).delete(url).set(auth(user.token)),
});

const code = async (value: string) => (await db.select().from(categories).where(eq(categories.code, value)))[0].id;

function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
}
const THIS = currentMonth();
const PREV = shiftMonth(THIS, -1);
const NEXT = shiftMonth(THIS, 1);
const TODAY = todayMsk();

async function setup() {
  const user = await registerUser();
  const acc = await as(user).post("/api/v1/accounts", { name: `Карта ${randomUUID().slice(0, 6)}`, kind: "debit_card", openingBalance: "500000.00", openingBalanceDate: `${shiftMonth(THIS, -6)}-01` });
  expect(acc.status).toBe(201);
  const cash = await as(user).post("/api/v1/accounts", { name: "Наличные", kind: "cash" });
  return { user, accountId: acc.body.id as string, cashId: cash.body.id as string };
}

async function tx(user: TestUser, body: Record<string, unknown>) {
  const res = await as(user).post("/api/v1/transactions", { type: "expense", date: TODAY, ...body });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body;
}

const budgetFor = (list: { items: Array<{ categoryId: string | null; children?: unknown[] }> }, categoryId: string | null) =>
  list.items.find((item) => item.categoryId === categoryId) as Record<string, any>;

describe("исполнение бюджета", () => {
  it("пример из спецификации: 10 000, −3 000, −2 000 в подкатегории, +500 возврат, перевод и исключённая — spent 4 500", async () => {
    const { user, accountId, cashId } = await setup();
    const food = await code("food");
    const groceries = await code("food.groceries");
    const created = await as(user).post("/api/v1/budgets", { categoryId: food, amount: "10000" });
    expect(created.status).toBe(201);

    await tx(user, { accountId, amount: "3000", categoryId: food });
    await tx(user, { accountId, amount: "2000", categoryId: groceries });
    await tx(user, { accountId, type: "income", amount: "500", categoryId: food }); // возврат в категории расходов
    await as(user).post("/api/v1/transfers", { fromAccountId: accountId, toAccountId: cashId, amount: "4000", date: TODAY });
    await tx(user, { accountId, amount: "1000", categoryId: food, excludeFromStats: true });

    const list = (await as(user).get("/api/v1/budgets")).body;
    const budget = budgetFor(list, food);
    expect(budget.spent).toBe("4500.00");
    expect(budget.remaining).toBe("5500.00");
    expect(budget.percent).toBe(45);
    expect(budget.category.name).toBe("Продукты");
    expect(list.month).toBe(THIS);
  });

  it("статус: больше лимита — over, от 80% — warning", async () => {
    const { user, accountId } = await setup();
    const eat = await code("eat");
    const transport = await code("transport");
    await as(user).post("/api/v1/budgets", { categoryId: eat, amount: "1000" });
    await as(user).post("/api/v1/budgets", { categoryId: transport, amount: "1000" });
    await tx(user, { accountId, amount: "1200", categoryId: eat });
    await tx(user, { accountId, amount: "850", categoryId: transport });
    const list = (await as(user).get("/api/v1/budgets")).body;
    expect(budgetFor(list, eat).status).toBe("over");
    expect(budgetFor(list, eat).remaining).toBe("-200.00");
    expect(budgetFor(list, transport).status).toBe("warning");
    // сортировка по проценту
    expect(list.items.map((item: { categoryId: string }) => item.categoryId)).toEqual([eat, transport]);
  });

  it("бюджет подкатегории — внутри родителя; общий бюджет с исключением; «без бюджета» с операциями без категории", async () => {
    const { user, accountId } = await setup();
    const food = await code("food");
    const groceries = await code("food.groceries");
    const home = await code("home");
    const eat = await code("eat");
    await as(user).post("/api/v1/budgets", { categoryId: food, amount: "20000" });
    expect((await as(user).post("/api/v1/budgets", { categoryId: groceries, amount: "8000" })).status).toBe(201);
    const total = await as(user).post("/api/v1/budgets", { categoryId: null, amount: "80000", excludedCategoryIds: [home] });
    expect(total.status).toBe(201);

    await tx(user, { accountId, amount: "5000", categoryId: groceries });
    await tx(user, { accountId, amount: "30000", categoryId: home }); // аренда — вне общего бюджета
    await tx(user, { accountId, amount: "700", categoryId: eat });
    await tx(user, { accountId, amount: "300" }); // без категории

    const list = (await as(user).get("/api/v1/budgets")).body;
    expect(list.items[0].categoryId).toBeNull(); // общий бюджет первым
    expect(list.items[0].spent).toBe("6000.00"); // 5000 + 700 + 300, без «Жилья»
    const parent = budgetFor(list, food);
    expect(parent.children).toHaveLength(1);
    expect(parent.children[0].spent).toBe("5000.00");
    expect(list.items.some((item: { categoryId: string }) => item.categoryId === groceries)).toBe(false);
    expect(list.total).toEqual({ amount: "80000.00", spent: "6000.00", remaining: "74000.00" });
    expect(list.unbudgetedSpent).toBe("31000.00"); // жильё 30000 + кафе 700 + без категории 300
  });
});

describe("версии по месяцам", () => {
  it("один бюджет на категорию в месяц: 409; без срока действует и в будущем", async () => {
    const { user } = await setup();
    const food = await code("food");
    await as(user).post("/api/v1/budgets", { categoryId: food, amount: "10000" });
    const again = await as(user).post("/api/v1/budgets", { categoryId: food, amount: "12000" });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("DUPLICATE_RESOURCE");
    const future = (await as(user).get(`/api/v1/budgets?month=${shiftMonth(THIS, 5)}`)).body;
    expect(budgetFor(future, food).amount).toBe("10000.00");
    const past = (await as(user).get(`/api/v1/budgets?month=${PREV}`)).body;
    expect(past.items).toEqual([]);
  });

  it("смена лимита со следующего месяца: прошлая версия закрыта, этот месяц не меняется", async () => {
    const { user } = await setup();
    const food = await code("food");
    const created = (await as(user).post("/api/v1/budgets", { categoryId: food, amount: "10000" })).body;
    const updated = await as(user).patch(`/api/v1/budgets/${created.id}`, { amount: "15000", fromMonth: NEXT });
    expect(updated.status).toBe(200);
    expect(updated.body.id).not.toBe(created.id);
    expect(updated.body.effectiveFrom).toBe(`${NEXT}-01`);

    const [old] = await db.select().from(budgets).where(eq(budgets.id, created.id));
    expect(old.effectiveTo?.startsWith(THIS)).toBe(true);
    expect(budgetFor((await as(user).get(`/api/v1/budgets?month=${THIS}`)).body, food).amount).toBe("10000.00");
    expect(budgetFor((await as(user).get(`/api/v1/budgets?month=${NEXT}`)).body, food).amount).toBe("15000.00");
  });

  it("правка с текущего месяца при начале в этом месяце — на месте", async () => {
    const { user } = await setup();
    const food = await code("food");
    const created = (await as(user).post("/api/v1/budgets", { categoryId: food, amount: "10000" })).body;
    const updated = await as(user).patch(`/api/v1/budgets/${created.id}`, { amount: "11000", rollover: true });
    expect(updated.body.id).toBe(created.id);
    expect(updated.body.amount).toBe("11000.00");
    expect(updated.body.rollover).toBe(true);
  });

  it("удаление со следующего месяца: в этом месяце бюджет есть, в следующем — нет", async () => {
    const { user } = await setup();
    const food = await code("food");
    const created = (await as(user).post("/api/v1/budgets", { categoryId: food, amount: "10000" })).body;
    expect((await as(user).delete(`/api/v1/budgets/${created.id}?fromMonth=${NEXT}`)).status).toBe(204);
    expect((await as(user).get(`/api/v1/budgets?month=${THIS}`)).body.items).toHaveLength(1);
    expect((await as(user).get(`/api/v1/budgets?month=${NEXT}`)).body.items).toHaveLength(0);
    // после закрытия можно завести новый бюджет с того месяца
    expect((await as(user).post("/api/v1/budgets", { categoryId: food, amount: "9000", fromMonth: NEXT })).status).toBe(201);
    // удаление с текущего месяца при начале в этом месяце убирает версию целиком
    expect((await as(user).delete(`/api/v1/budgets/${created.id}`)).status).toBe(204);
    expect((await as(user).get(`/api/v1/budgets?month=${THIS}`)).body.items).toHaveLength(0);
  });
});

describe("перенос остатка", () => {
  it("лимит 25 000, в прошлом месяце потрачено 22 000 — в этом 28 000; без переноса — 25 000", async () => {
    const { user, accountId } = await setup();
    const eat = await code("eat");
    const transport = await code("transport");
    await as(user).post("/api/v1/budgets", { categoryId: eat, amount: "25000", rollover: true, fromMonth: PREV });
    await as(user).post("/api/v1/budgets", { categoryId: transport, amount: "25000", fromMonth: PREV });
    await tx(user, { accountId, amount: "22000", categoryId: eat, date: `${PREV}-15` });
    await tx(user, { accountId, amount: "22000", categoryId: transport, date: `${PREV}-15` });
    const list = (await as(user).get("/api/v1/budgets")).body;
    expect(budgetFor(list, eat).effectiveAmount).toBe("28000.00");
    expect(budgetFor(list, transport).effectiveAmount).toBe("25000.00");
  });

  it("перерасход в прошлом месяце не уменьшает лимит", async () => {
    const { user, accountId } = await setup();
    const eat = await code("eat");
    await as(user).post("/api/v1/budgets", { categoryId: eat, amount: "10000", rollover: true, fromMonth: PREV });
    await tx(user, { accountId, amount: "13000", categoryId: eat, date: `${PREV}-10` });
    expect(budgetFor((await as(user).get("/api/v1/budgets")).body, eat).effectiveAmount).toBe("10000.00");
  });
});

describe("предложения по средним тратам", () => {
  it("медиана за 3 полных месяца вверх до 500 ₽; меньше 1 000 и уже с бюджетом — не предлагаются", async () => {
    const { user, accountId } = await setup();
    const food = await code("food");
    const eat = await code("eat");
    const transport = await code("transport");
    const spends: Array<[string, string, number[]]> = [
      [food, "food", [10200, 9800, 12000]],   // медиана 10 200 → 10 500
      [eat, "eat", [600, 900, 400]],          // медиана 600 — меньше 1 000
      [transport, "transport", [3000, 3000, 3000]],
    ];
    for (const [categoryId, , amounts] of spends) {
      for (const [i, amount] of amounts.entries()) {
        await tx(user, { accountId, amount: String(amount), categoryId, date: `${shiftMonth(THIS, -(i + 1))}-12` });
      }
    }
    await as(user).post("/api/v1/budgets", { categoryId: transport, amount: "3000" });

    const suggestions = (await as(user).get("/api/v1/budgets/suggestions")).body;
    expect(suggestions).toEqual([{ categoryId: food, name: "Продукты", median3m: "10200.00", suggestedAmount: "10500.00" }]);

    const bulk = await as(user).post("/api/v1/budgets/bulk", { items: [{ categoryId: food, amount: "10500" }] });
    expect(bulk.status).toBe(201);
    expect(bulk.body.created[0].amount).toBe("10500.00");
    const conflict = await as(user).post("/api/v1/budgets/bulk", { items: [{ categoryId: food, amount: "1" }, { categoryId: eat, amount: "1" }] });
    expect(conflict.status).toBe(409);
    expect(conflict.body.error.details.categoryIds).toEqual([food]);
    // ни один из пачки не создан
    expect(budgetFor((await as(user).get("/api/v1/budgets")).body, eat)).toBeUndefined();
  });
});

describe("проверки ввода", () => {
  it("категория доходов — 400, нулевая сумма и неверный месяц — 400, повтор по id — 200", async () => {
    const { user } = await setup();
    const income = (await db.select().from(categories).where(eq(categories.kind, "income")))[0].id;
    expect((await as(user).post("/api/v1/budgets", { categoryId: income, amount: "1000" })).status).toBe(400);
    expect((await as(user).post("/api/v1/budgets", { categoryId: null, amount: "0" })).status).toBe(400);
    expect((await as(user).get("/api/v1/budgets?month=2026-13")).status).toBe(400);
    const id = randomUUID();
    expect((await as(user).post("/api/v1/budgets", { id, categoryId: null, amount: "5000" })).status).toBe(201);
    expect((await as(user).post("/api/v1/budgets", { id, categoryId: null, amount: "5000" })).status).toBe(200);
  });

  it("старый /api/budgets удалён", async () => {
    const { user } = await setup();
    expect((await as(user).get("/api/budgets")).status).toBe(404);
  });
});

describe("права: B не видит и не меняет бюджеты A", () => {
  it("список B пуст, PATCH и DELETE чужого — 404, своя категория A для B — 404; бюджет A не изменился", async () => {
    const { user: a } = await setup();
    const { user: b } = await setup();
    const food = await code("food");
    const created = (await as(a).post("/api/v1/budgets", { categoryId: food, amount: "10000" })).body;
    const own = await db.insert(categories).values({ userId: a.id, name: `Своя ${randomUUID().slice(0, 6)}`, kind: "expense" }).returning();

    expect((await as(b).get("/api/v1/budgets")).body.items).toEqual([]);
    expect((await as(b).patch(`/api/v1/budgets/${created.id}`, { amount: "1" })).status).toBe(404);
    expect((await as(b).delete(`/api/v1/budgets/${created.id}`)).status).toBe(404);
    expect((await as(b).post("/api/v1/budgets", { categoryId: own[0].id, amount: "1000" })).status).toBe(404);
    expect((await as(b).post("/api/v1/budgets", { categoryId: null, amount: "1000", excludedCategoryIds: [own[0].id] })).status).toBe(404);
    // чужой id при создании — 409, а не доступ к бюджету A
    expect((await as(b).post("/api/v1/budgets", { id: created.id, categoryId: food, amount: "1" })).status).toBe(409);

    const [row] = await db.select().from(budgets).where(eq(budgets.id, created.id));
    expect(row.amount).toBe("10000.00");
    expect(row.deletedAt).toBeNull();
  });
});
