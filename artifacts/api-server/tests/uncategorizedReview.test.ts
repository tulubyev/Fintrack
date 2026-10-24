/**
 * Разбор «Без категории» (E1.3-T9): группы по мерчанту без номеров, предложение нейросети, категория всей группе
 * с правилом на будущее или без, права.
 */
import { describe, expect, it } from "vitest";
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
});

async function setup() {
  const user = await registerUser();
  const account = (await as(user).post("/api/v1/accounts", { name: "Карта", kind: "debit_card", openingBalance: "100000.00", openingBalanceDate: TODAY })).body.id;
  const add = async (body: object) => (await as(user).post("/api/v1/transactions", { type: "expense", accountId: account, date: TODAY, amount: "100", ...body })).body.id as string;
  return { user, add };
}

describe("группы", () => {
  it("по мерчанту без номеров терминала, по типу; с предложением нейросети; размеченные не входят", async () => {
    const { user, add } = await setup();
    const sidorov = [await add({ merchant: "IP SIDOROV 4021", amount: "300" }), await add({ merchant: "IP SIDOROV 5233", amount: "200" }), await add({ merchant: "ИП Sidorov", amount: "50" })];
    await add({ type: "income", merchant: "OOO ROMASHKA", amount: "5000" });
    await add({ merchant: "Пятёрочка" });
    const hobby = await code("leisure.hobby");
    await db.update(transactions).set({ suggestedCategoryId: hobby }).where(eq(transactions.id, sidorov[0]));

    const res = await as(user).get("/api/v1/transactions/uncategorized/groups");
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(4);
    expect(res.body.groups).toHaveLength(2);
    expect(res.body.groups[0]).toMatchObject({ key: "sidorov", field: "merchant", type: "expense", count: 3, totalAmount: "550.00", suggestedCategoryId: hobby });
    expect(res.body.groups[0].sampleIds.sort()).toEqual([...sidorov].sort());
    expect(res.body.groups[1]).toMatchObject({ key: "romashka", type: "income", count: 1, suggestedCategoryId: null });
  });
});

describe("категория группе", () => {
  it("с правилом: вся группа и следующая операция — rule_user; повтор с другой категорией меняет то же правило", async () => {
    const { user, add } = await setup();
    const ids = [await add({ merchant: "IP SIDOROV 4021" }), await add({ merchant: "IP SIDOROV 5233" })];
    const repair = await code("home.repair");
    const res = await as(user).post("/api/v1/transactions/uncategorized/groups/apply", { key: "sidorov", type: "expense", categoryId: repair });
    expect(res.body).toMatchObject({ updated: 2, ruleCreated: true });
    for (const id of ids) {
      expect((await db.select().from(transactions).where(eq(transactions.id, id)))[0]).toMatchObject({ categoryId: repair, categorySource: "rule_user", suggestedCategoryId: null });
    }
    const next = await add({ merchant: "IP SIDOROV 7777" });
    expect((await db.select().from(transactions).where(eq(transactions.id, next)))[0]).toMatchObject({ categoryId: repair, categorySource: "rule_user" });

    // операция, прошедшая мимо конвейера (например, импорт до появления правила)
    await db.insert(transactions).values({ userId: user.id, accountId: (await db.select().from(transactions).where(eq(transactions.id, next)))[0].accountId, type: "expense", amount: "-10.00", merchant: "IP SIDOROV 1", description: "IP SIDOROV 1", transactionDate: new Date(), localDate: TODAY });
    expect((await as(user).post("/api/v1/transactions/uncategorized/groups/apply", { key: "sidorov", type: "expense", categoryId: await code("other") })).body)
      .toMatchObject({ updated: 1, ruleCreated: false });
    const rules = await db.select().from(categoryRules).where(and(eq(categoryRules.userId, user.id), isNull(categoryRules.deletedAt)));
    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatchObject({ field: "merchant", op: "contains", pattern: "sidorov", categoryId: await code("other"), source: "correction" });
  });

  it("без правила — ручная категория; категория не того вида — 400", async () => {
    const { user, add } = await setup();
    const id = await add({ description: "Оплата ремонт крыши дачи" });
    const groups = (await as(user).get("/api/v1/transactions/uncategorized/groups")).body.groups;
    const key = groups.find((g: { field: string }) => g.field === "description")?.key;
    expect(key).toBeTruthy();
    expect((await as(user).post("/api/v1/transactions/uncategorized/groups/apply", { key, type: "expense", categoryId: await code("inc.salary") })).status).toBe(400);
    const res = await as(user).post("/api/v1/transactions/uncategorized/groups/apply", { key, type: "expense", categoryId: await code("home.repair"), remember: false });
    expect(res.body).toMatchObject({ updated: 1, ruleCreated: false, ruleId: null });
    expect((await db.select().from(transactions).where(eq(transactions.id, id)))[0].categorySource).toBe("manual");
    expect(await db.select().from(categoryRules).where(eq(categoryRules.userId, user.id))).toHaveLength(0);
  });
});

describe("права", () => {
  it("B не видит групп A и не размечает операции A; чужая категория — 404", async () => {
    const a = await setup();
    const aTx = await a.add({ merchant: "IP SECRETOV" });
    const b = await registerUser();
    expect((await as(b).get("/api/v1/transactions/uncategorized/groups")).body).toEqual({ groups: [], total: 0 });
    expect((await as(b).post("/api/v1/transactions/uncategorized/groups/apply", { key: "secretov", type: "expense", categoryId: await code("other") })).body.updated).toBe(0);
    const aOwn = (await as(a.user).post("/api/v1/categories", { name: "Тайная", kind: "expense" })).body.id;
    expect((await as(b).post("/api/v1/transactions/uncategorized/groups/apply", { key: "secretov", type: "expense", categoryId: aOwn })).status).toBe(404);
    expect((await db.select().from(transactions).where(eq(transactions.id, aTx)))[0].categoryId).toBeNull();
  });
});
