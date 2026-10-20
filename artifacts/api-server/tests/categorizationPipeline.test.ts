/**
 * Конвейер автокатегоризации (E1.3-T6): порядок источников, вид категории по направлению, скрытые категории,
 * правила пользователя, вызов из ручного ввода, перенос правил при удалении категории.
 */
import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { db, accounts, categories, categoryRules, transactions, userCategoryPrefs } from "@workspace/db";
import { todayMsk } from "../src/services/budgetService";
import { createCategorizer, type CategorizeInput } from "../src/services/categorization/pipeline";
import { keywordCategory } from "../src/services/categorization/keywords";
import { app, auth, registerUser, type TestUser } from "./helpers";

const code = async (value: string) => (await db.select().from(categories).where(eq(categories.code, value)))[0].id;
const out = (input: Partial<CategorizeInput>): CategorizeInput => ({ direction: "out", amount: 500, ...input });
const rule = (user: TestUser, values: Partial<typeof categoryRules.$inferInsert> & { categoryId: string; pattern: string }) =>
  db.insert(categoryRules).values({ userId: user.id, field: "description", op: "contains", source: "manual", ...values }).returning().then((rows) => rows[0]);

let user: TestUser;
beforeAll(async () => {
  user = await registerUser();
});

describe("порядок источников", () => {
  it("перевод, мерчант, MCC, банк, ключевые слова, без категории", async () => {
    const categorize = await createCategorizer(user.id);
    expect(await categorize(out({ transferGroupId: "00000000-0000-0000-0000-000000000001", merchant: "PYATEROCHKA" })))
      .toMatchObject({ categoryId: await code("xfer.own"), source: "transfer" });
    expect(await categorize(out({ merchant: "PYATEROCHKA 4021 MOSCOW RUS", mcc: "5812" })))
      .toMatchObject({ categoryId: await code("food.groceries"), source: "merchant", confidence: 0.9, merchantNormalized: "Пятёрочка" });
    expect(await categorize(out({ merchant: "IP SIDOROV", mcc: "5411", bankCategory: "Рестораны" })))
      .toMatchObject({ categoryId: await code("food.groceries"), source: "mcc", merchantNormalized: null });
    expect((await categorize(out({ mcc: "4112", amountRub: 3500 }))).categoryId).toBe(await code("travel.transport"));
    expect(await categorize(out({ merchant: "IP SIDOROV", bankCategory: "Рестораны и кафе.", institutionCode: "sber" })))
      .toMatchObject({ categoryId: await code("eat"), source: "bank", confidence: 0.8 });
    expect(await categorize(out({ description: "Перевод по номеру телефона +7 900 ***-**-12" })))
      .toMatchObject({ categoryId: await code("p2p"), source: "keyword", confidence: 0.6 });
    expect(await categorize(out({ description: "Неизвестная строка" }))).toMatchObject({ categoryId: null, source: "none", confidence: null });
  });

  it("двусмысленный MCC уступает банку и ключевым словам, но лучше, чем ничего", async () => {
    const categorize = await createCategorizer(user.id);
    expect((await categorize(out({ mcc: "4829", bankCategory: "Супермаркеты" }))).source).toBe("bank");
    expect((await categorize(out({ mcc: "5399", description: "Оплата в аптеке" }))).categoryId).toBe(await code("health.pharmacy"));
    expect(await categorize(out({ mcc: "4829" }))).toMatchObject({ categoryId: await code("p2p"), source: "mcc", confidence: 0.3 });
  });

  it("поступление не получает категорию расходов: мерчант узнан, но категория — только из доходов", async () => {
    const categorize = await createCategorizer(user.id);
    expect(await categorize({ direction: "in", amount: 900, merchant: "OZON.RU" })).toMatchObject({ categoryId: null, source: "none", merchantNormalized: "Ozon" });
    expect((await categorize({ direction: "in", amount: 90000, description: "Заработная плата за октябрь" })).categoryId).toBe(await code("inc.salary"));
    expect((await categorize({ direction: "in", amount: 120, description: "Зачисление кэшбэка" })).categoryId).toBe(await code("inc.cashback"));
    expect((await categorize({ direction: "in", amount: 120, mcc: "5411" })).categoryId).toBeNull();
  });

  it("скрытая системная категория заменяется родителем; скрыт и родитель — категория не ставится", async () => {
    const owner = await registerUser();
    const groceries = await code("food.groceries");
    await db.insert(userCategoryPrefs).values({ userId: owner.id, categoryId: groceries, hidden: true });
    expect((await (await createCategorizer(owner.id))(out({ merchant: "PYATEROCHKA" }))).categoryId).toBe(await code("food"));
    await db.insert(userCategoryPrefs).values({ userId: owner.id, categoryId: await code("food"), hidden: true });
    expect((await (await createCategorizer(owner.id))(out({ merchant: "PYATEROCHKA" }))).categoryId).toBeNull();
  });
});

describe("ключевые слова", () => {
  it("основы слов, короткие слова целиком, исключения для покупок по QR", () => {
    expect(keywordCategory("out", "АЗС № 12")).toBe("auto.fuel");
    expect(keywordCategory("out", "Заправка у дороги")).toBe("auto.fuel");
    expect(keywordCategory("out", "BARNAUL CITY")).toBeNull(); // «bar» короче четырёх букв — только целым словом
    expect(keywordCategory("out", "BAR 1703")).toBe("eat.cafe");
    expect(keywordCategory("out", "Барбершоп на Арбате")).toBe("beauty");
    expect(keywordCategory("out", "Оплата по QR-коду СБП ИП Иванов")).toBeNull();
    expect(keywordCategory("out", "Перевод СБП Иванову И.")).toBe("p2p");
    expect(keywordCategory("in", "Перевод СБП от Иванова И.")).toBe("inc.p2p");
    expect(keywordCategory("out", "Комиссия за перевод")).toBe("finance.fees");
  });
});

describe("правила пользователя", () => {
  it("важнее мерчанта; фильтры направления, суммы и счёта; приоритет; переименование мерчанта", async () => {
    const owner = await registerUser();
    const [account] = await db.insert(accounts).values({ userId: owner.id, accountName: "Карта", kind: "debit_card", balance: "0" }).returning();
    const rent = await code("home.rent");
    await rule(owner, { pattern: "иванов", categoryId: rent, direction: "out", amountMin: "10000", accountId: account.id, renameMerchantTo: "Арендодатель" });
    await rule(owner, { pattern: "пятерочка", field: "merchant", op: "equals", categoryId: await code("food.local"), priority: 50 });
    await rule(owner, { pattern: "пятер", field: "merchant", op: "starts_with", categoryId: await code("other"), priority: 60 });
    await rule(owner, { pattern: "5411", field: "mcc", op: "equals", categoryId: await code("inc.salary") }); // доходы: к расходу не применится
    const deleted = await rule(owner, { pattern: "deleted", categoryId: rent });
    await db.update(categoryRules).set({ deletedAt: new Date() }).where(eq(categoryRules.id, deleted.id));
    await rule(user, { pattern: "чужое правило", categoryId: rent });

    const categorize = await createCategorizer(owner.id);
    const hit = await categorize(out({ amount: 30000, accountId: account.id, description: "Перевод Иванов И.И." }));
    expect(hit).toMatchObject({ categoryId: rent, source: "rule_user", confidence: 1, merchantNormalized: "Арендодатель" });
    expect(hit.ruleId).not.toBeNull();
    expect((await categorize(out({ amount: 3000, accountId: account.id, description: "Перевод Иванов И.И." }))).source).toBe("keyword");
    expect((await categorize(out({ amount: 30000, description: "Перевод Иванов И.И." }))).source).toBe("keyword");
    expect((await categorize({ direction: "in", amount: 30000, accountId: account.id, description: "Перевод Иванов И.И." })).categoryId).toBe(await code("inc.p2p"));
    expect((await categorize(out({ merchant: "PYATEROCHKA 4021" }))).categoryId).toBe(await code("food.local"));
    expect((await categorize(out({ merchant: "IP SIDOROV", mcc: "5411" }))).source).toBe("mcc");
    expect((await categorize(out({ description: "deleted" }))).source).toBe("none");
    expect((await categorize(out({ description: "чужое правило" }))).source).toBe("none");
  });
});

describe("ручной ввод", () => {
  it("без категории — конвейер и счётчик правила; с категорией — manual", async () => {
    const owner = await registerUser();
    const as = (url: string, body: object) => request(app).post(url).set(auth(owner.token)).send(body);
    const acc = (await as("/api/v1/accounts", { name: "Карта", kind: "debit_card", openingBalance: "10000.00", openingBalanceDate: todayMsk() })).body.id;
    const auto = await as("/api/v1/transactions", { type: "expense", accountId: acc, amount: "450", date: todayMsk(), merchant: "Пятёрочка" });
    expect(auto.status, JSON.stringify(auto.body)).toBe(201);
    const [row] = await db.select().from(transactions).where(eq(transactions.id, auto.body.id));
    expect(row).toMatchObject({ categoryId: await code("food.groceries"), categorySource: "merchant", categoryConfidence: 0.9, merchantNormalized: "Пятёрочка" });

    const chosen = await as("/api/v1/transactions", { type: "expense", accountId: acc, amount: "450", date: todayMsk(), merchant: "Пятёрочка", categoryId: await code("food.local") });
    expect((await db.select().from(transactions).where(eq(transactions.id, chosen.body.id)))[0]).toMatchObject({ categorySource: "manual", categoryConfidence: null });

    const created = await rule(owner, { pattern: "кофе у дома", categoryId: await code("eat.cafe") });
    await as("/api/v1/transactions", { type: "expense", accountId: acc, amount: "250", date: todayMsk(), description: "Кофе у дома" });
    await as("/api/v1/transactions", { type: "expense", accountId: acc, amount: "250", date: todayMsk(), description: "Кофе у дома" });
    expect((await db.select().from(categoryRules).where(eq(categoryRules.id, created.id)))[0].hitCount).toBe(2);
  });

  it("удаление своей категории переносит правила в замену", async () => {
    const owner = await registerUser();
    const own = (await request(app).post("/api/v1/categories").set(auth(owner.token)).send({ name: "Дача", kind: "expense" })).body.id;
    const created = await rule(owner, { pattern: "снт", categoryId: own });
    const home = await code("home");
    const res = await request(app).delete(`/api/v1/categories/${own}`).set(auth(owner.token)).send({ replaceWithId: home });
    expect(res.body).toMatchObject({ movedRules: 1 });
    expect((await db.select().from(categoryRules).where(eq(categoryRules.id, created.id)))[0].categoryId).toBe(home);
  });
});
