/**
 * Правила категоризации и исправления (E1.3-T7): CRUD правил, предпросмотр, «эта и будущие» и «эта, будущие и прошлые»
 * из исправления категории операции, ручная разметка неприкосновенна, права.
 */
import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { and, eq, isNull } from "drizzle-orm";
import { db, categories, categoryRules, transactions } from "@workspace/db";
import { todayMsk } from "../src/services/budgetService";
import { app, auth, registerUser, type TestUser } from "./helpers";

const TODAY = todayMsk();
const code = async (value: string) => (await db.select().from(categories).where(eq(categories.code, value)))[0].id;
const as = (user: TestUser) => ({
  get: (url: string) => request(app).get(url).set(auth(user.token)),
  post: (url: string, body: object) => request(app).post(url).set(auth(user.token)).send(body),
  patch: (url: string, body: object) => request(app).patch(url).set(auth(user.token)).send(body),
  delete: (url: string) => request(app).delete(url).set(auth(user.token)),
});
const txRow = async (id: string) => (await db.select().from(transactions).where(eq(transactions.id, id)))[0];

async function setup() {
  const user = await registerUser();
  const account = (await as(user).post("/api/v1/accounts", { name: "Карта", kind: "debit_card", openingBalance: "100000.00", openingBalanceDate: TODAY })).body.id;
  const spend = async (body: object) => (await as(user).post("/api/v1/transactions", { type: "expense", accountId: account, date: TODAY, amount: "100", ...body })).body.id as string;
  return { user, account, spend };
}

describe("CRUD правил", () => {
  let user: TestUser;
  beforeAll(async () => { user = await registerUser(); });

  it("создаёт с нормализованным шаблоном, повтор — 409, список по приоритету, правка и удаление", async () => {
    const food = await code("food.local");
    const created = await as(user).post("/api/v1/category-rules", { field: "merchant", op: "equals", pattern: "  Пятёрочка! ", categoryId: food, direction: "out" });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect(created.body).toMatchObject({ rule: { pattern: "пятерочка", source: "manual", hitCount: 0 }, affectedCount: 0 });
    expect((await as(user).post("/api/v1/category-rules", { field: "merchant", op: "equals", pattern: "ПЯТЕРОЧКА", categoryId: food })).status).toBe(409);
    await as(user).post("/api/v1/category-rules", { field: "description", op: "contains", pattern: "аренда", categoryId: await code("home.rent"), priority: 10 });
    await as(user).post("/api/v1/category-rules", { field: "mcc", op: "equals", pattern: "5411", categoryId: food });

    const page1 = (await as(user).get("/api/v1/category-rules?limit=2")).body;
    expect(page1.items.map((r: { pattern: string }) => r.pattern)).toEqual(["аренда", "5411"]);
    const page2 = (await as(user).get(`/api/v1/category-rules?limit=2&cursor=${page1.nextCursor}`)).body;
    expect(page2).toMatchObject({ items: [{ pattern: "пятерочка" }], nextCursor: null });

    const id = created.body.rule.id;
    expect((await as(user).patch(`/api/v1/category-rules/${id}`, { categoryId: await code("food.groceries"), renameMerchantTo: "Пятёрочка у дома" })).body)
      .toMatchObject({ categoryId: await code("food.groceries"), renameMerchantTo: "Пятёрочка у дома", affectedCount: 0 });
    expect((await as(user).delete(`/api/v1/category-rules/${id}`)).status).toBe(204);
    expect((await as(user).patch(`/api/v1/category-rules/${id}`, { priority: 1 })).status).toBe(404);
  });

  it("ошибки: перевод, категория не того вида, MCC не из цифр, «от» больше «до», пустой шаблон", async () => {
    const food = await code("food");
    const post = (body: object) => as(user).post("/api/v1/category-rules", { field: "description", op: "contains", pattern: "тест", categoryId: food, ...body });
    expect((await post({ categoryId: await code("xfer.own") })).status).toBe(400);
    expect((await post({ direction: "in" })).status).toBe(400);
    expect((await post({ field: "mcc", op: "equals", pattern: "54a1" })).status).toBe(400);
    expect((await post({ amountMin: "500", amountMax: "100" })).status).toBe(400);
    expect((await post({ pattern: "!!" })).status).toBe(400);
  });
});

describe("применение к прошлым", () => {
  it("правило с «и прошлые» меняет автоматические операции и не трогает ручные; предпросмотр считает так же", async () => {
    const { user, spend } = await setup();
    const auto1 = await spend({ description: "Оплата СНТ Ромашка взнос" });
    const auto2 = await spend({ description: "СНТ Ромашка, электричество" });
    const manual = await spend({ description: "СНТ Ромашка — свет", categoryId: await code("other") });
    await spend({ description: "Другое" });

    const preview = (await as(user).post("/api/v1/category-rules/preview", { field: "description", op: "contains", pattern: "снт ромашка" })).body;
    expect(preview.matchCount).toBe(2);
    expect(preview.sample.map((t: { id: string }) => t.id).sort()).toEqual([auto1, auto2].sort());

    const utilities = await code("home.utilities");
    const res = await as(user).post("/api/v1/category-rules", { field: "description", op: "contains", pattern: "СНТ Ромашка", categoryId: utilities, apply: "future_and_past" });
    expect(res.body.affectedCount).toBe(2);
    for (const id of [auto1, auto2]) expect(await txRow(id)).toMatchObject({ categoryId: utilities, categorySource: "rule_user", categoryConfidence: 1 });
    expect(await txRow(manual)).toMatchObject({ categoryId: await code("other"), categorySource: "manual" });
    expect((await db.select().from(categoryRules).where(eq(categoryRules.id, res.body.rule.id)))[0].hitCount).toBe(2);
  });
});

describe("исправление категории операции", () => {
  it("«эта и будущие»: правило по мерчанту, следующая операция того же мерчанта — rule_user; повтор меняет то же правило", async () => {
    const { user, spend } = await setup();
    const first = await spend({ merchant: "Пятёрочка" });
    expect((await txRow(first)).categorySource).toBe("merchant");
    const local = await code("food.local");

    const similar = (await as(user).get(`/api/v1/transactions/${first}/similar`)).body;
    expect(similar).toMatchObject({ similar: { field: "merchant", op: "equals", pattern: "пятерочка", label: "Пятёрочка" }, pastCount: 0 });

    const res = await as(user).patch(`/api/v1/transactions/${first}`, { categoryId: local, applyToSimilar: "future" });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({ transaction: { categoryId: local }, ruleCreated: { field: "merchant", pattern: "пятерочка", source: "correction" }, affectedCount: 0 });
    expect((await txRow(first)).categorySource).toBe("manual");

    const next = await spend({ merchant: "ПЯТЕРОЧКА" });
    expect(await txRow(next)).toMatchObject({ categoryId: local, categorySource: "rule_user" });

    const groceries = await code("food.groceries");
    await as(user).patch(`/api/v1/transactions/${next}`, { categoryId: groceries, applyToSimilar: "future" });
    const rules = await db.select().from(categoryRules).where(and(eq(categoryRules.userId, user.id), isNull(categoryRules.deletedAt)));
    expect(rules).toHaveLength(1);
    expect(rules[0].categoryId).toBe(groceries);
  });

  it("«эта, будущие и прошлые»: прошлые автоматические меняются, ручные — нет; P2P — правило по описанию", async () => {
    const { user, spend } = await setup();
    const rent = await code("home.rent");
    const past = [await spend({ description: "Перевод Иванов И.И.", amount: "30000" }), await spend({ description: "Перевод Иванов И.И. за май", amount: "30000" })];
    const manual = await spend({ description: "Перевод Иванов И.И.", amount: "500", categoryId: await code("gifts.gifts") });
    const target = await spend({ description: "Перевод Иванов И.И.", amount: "30000" });
    expect((await txRow(target)).categoryId).toBe(await code("p2p"));
    expect((await as(user).get(`/api/v1/transactions/${target}/similar`)).body).toMatchObject({ similar: { field: "description", pattern: "перевод иванов" }, pastCount: 2 });

    const res = await as(user).patch(`/api/v1/transactions/${target}`, { categoryId: rent, applyToSimilar: "future_and_past" });
    expect(res.body).toMatchObject({ ruleCreated: { field: "description", op: "contains", pattern: "перевод иванов" }, affectedCount: 2 });
    for (const id of past) expect(await txRow(id)).toMatchObject({ categoryId: rent, categorySource: "rule_user" });
    expect(await txRow(manual)).toMatchObject({ categoryId: await code("gifts.gifts"), categorySource: "manual" });
    expect(await txRow(target)).toMatchObject({ categoryId: rent, categorySource: "manual" });
  });

  it("без applyToSimilar — только эта операция; нечего взять в правило — правило не создаётся", async () => {
    const { user, spend } = await setup();
    const plain = await spend({ merchant: "Пятёрочка" });
    expect((await as(user).patch(`/api/v1/transactions/${plain}`, { categoryId: await code("food.local") })).body.ruleCreated).toBeUndefined();
    const bare = await spend({});
    expect((await as(user).get(`/api/v1/transactions/${bare}/similar`)).body).toEqual({ similar: null, pastCount: 0 });
    const res = await as(user).patch(`/api/v1/transactions/${bare}`, { categoryId: await code("other"), applyToSimilar: "future" });
    expect(res.status).toBe(200);
    expect(res.body.ruleCreated).toBeUndefined();
    expect(await db.select().from(categoryRules).where(eq(categoryRules.userId, user.id))).toHaveLength(0);
  });
});

describe("права", () => {
  it("B не видит, не меняет и не удаляет правила A, не применяет их к операциям A и не смотрит похожие у операции A", async () => {
    const a = await setup();
    const b = await registerUser();
    const aOwn = (await as(a.user).post("/api/v1/categories", { name: "Тайная", kind: "expense" })).body.id;
    const rule = (await as(a.user).post("/api/v1/category-rules", { field: "description", op: "contains", pattern: "секрет", categoryId: aOwn })).body.rule;
    const aTx = await a.spend({ description: "секрет" });

    expect((await as(b).get("/api/v1/category-rules")).body.items).toEqual([]);
    expect((await as(b).patch(`/api/v1/category-rules/${rule.id}`, { pattern: "взлом" })).status).toBe(404);
    expect((await as(b).delete(`/api/v1/category-rules/${rule.id}`)).status).toBe(404);
    expect((await as(b).post("/api/v1/category-rules", { field: "description", op: "contains", pattern: "x y", categoryId: aOwn })).status).toBe(404);
    expect((await as(b).post("/api/v1/category-rules/preview", { field: "description", op: "contains", pattern: "секрет" })).body.matchCount).toBe(0);
    expect((await as(b).post("/api/v1/category-rules", { field: "description", op: "contains", pattern: "секрет", categoryId: await code("other"), apply: "future_and_past" })).body.affectedCount).toBe(0);
    expect((await as(b).get(`/api/v1/transactions/${aTx}/similar`)).status).toBe(404);
    expect((await txRow(aTx)).categoryId).toBe(aOwn);
    expect((await db.select().from(categoryRules).where(eq(categoryRules.id, rule.id)))[0]).toMatchObject({ pattern: "секрет", deletedAt: null });
  });
});
