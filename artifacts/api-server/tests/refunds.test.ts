/**
 * Возвраты (E1.3): поступление в категории расходов уменьшает траты этой категории — на главной, в бюджете,
 * в аналитике и в итогах ленты — и не считается доходом. Конвейер относит «Возврат …» к категории последней
 * покупки у того же мерчанта за 60 дней.
 */
import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { db, categories, transactions } from "@workspace/db";
import { todayMsk } from "../src/services/budgetService";
import { app, auth, registerUser, type TestUser } from "./helpers";

const TODAY = todayMsk();
const MONTH = TODAY.slice(0, 7);
const code = async (value: string) => (await db.select().from(categories).where(eq(categories.code, value)))[0].id;
const daysAgo = (days: number) => new Date(new Date(`${TODAY}T12:00:00Z`).getTime() - days * 86_400_000).toISOString().slice(0, 10);

let user: TestUser;
let account: string;
const as = (url: string) => request(app).get(url).set(auth(user.token));
const add = async (body: object) =>
  (await request(app).post("/api/v1/transactions").set(auth(user.token)).send({ accountId: account, date: TODAY, ...body })).body;

beforeAll(async () => {
  user = await registerUser();
  account = (await request(app).post("/api/v1/accounts").set(auth(user.token)).send({ name: "Карта", kind: "debit_card", openingBalance: "100000.00", openingBalanceDate: `${MONTH}-01` })).body.id;
});

describe("возврат 1 000 ₽ при покупках на 5 000 ₽ в «Одежде»", () => {
  it("траты «Одежды» — 4 000 ₽ на главной, в бюджете, в аналитике и в ленте; доходом возврат не считается", async () => {
    const clothes = await code("clothes");
    await add({ type: "expense", amount: "3000", categoryId: clothes, merchant: "Lime" });
    await add({ type: "expense", amount: "2000", categoryId: clothes, merchant: "Lime" });
    await add({ type: "income", amount: "1000", categoryId: clothes, merchant: "Lime", description: "Возврат Lime" });
    await request(app).post("/api/v1/budgets").set(auth(user.token)).send({ categoryId: clothes, amount: "10000" });

    const summary = (await as(`/api/v1/dashboard/summary?month=${MONTH}`)).body;
    expect(summary.topCategories.items.find((item: { categoryId: string }) => item.categoryId === clothes)).toMatchObject({ amount: "4000.00" });
    expect(summary.period).toMatchObject({ expense: "4000.00", income: "0.00", net: "-4000.00" });

    const budget = (await as(`/api/v1/budgets?month=${MONTH}`)).body.items.find((item: { categoryId: string }) => item.categoryId === clothes);
    expect(budget.spent).toBe("4000.00");

    const feed = (await as(`/api/v1/transactions/summary?from=${MONTH}-01&to=${TODAY}`)).body;
    expect(feed).toMatchObject({ expense: "4000.00", income: "0.00" });

    const cashflow = (await as("/api/v1/analytics/cashflow?months=1")).body.items.at(-1);
    expect(cashflow).toMatchObject({ expense: "4000.00", income: "0.00" });
  });
});

describe("конвейер: «Возврат» → категория покупки", () => {
  it("по мерчанту из словаря и по строке без номеров; старше 60 дней и без покупки — не возврат", async () => {
    // категория — как у покупки (подарок), а не словарная «Спорттовары»
    const gift = await add({ type: "expense", amount: "500", merchant: "SPORTMASTER 1234", categoryId: await code("gifts.gifts"), date: daysAgo(10) });
    expect(gift.categorySource).toBe("manual");
    const refundGift = await add({ type: "income", amount: "500", description: "Возврат SPORTMASTER 5678" });
    expect(refundGift).toMatchObject({ categoryId: await code("gifts.gifts"), categorySource: "keyword" });

    await add({ type: "expense", amount: "700", merchant: "ATELIER NOVA 77", categoryId: await code("clothes"), date: daysAgo(5) });
    const refundNova = await add({ type: "income", amount: "700", description: "Отмена покупки ATELIER NOVA 99" });
    expect(refundNova.categoryId).toBe(await code("clothes"));

    await add({ type: "expense", amount: "900", merchant: "OLD SHOP", categoryId: await code("clothes"), date: daysAgo(90) });
    expect((await add({ type: "income", amount: "900", description: "Refund OLD SHOP" })).categoryId).toBeNull();
    expect((await add({ type: "income", amount: "100", description: "Возврат NEVER BOUGHT" })).categoryId).toBeNull();
    // без слова «возврат» поступление от магазина — не возврат
    expect((await add({ type: "income", amount: "100", merchant: "ATELIER NOVA 1" })).categoryId).toBeNull();
  });

  it("покупка другого пользователя не делает поступление возвратом", async () => {
    const other = await registerUser();
    const otherAcc = (await request(app).post("/api/v1/accounts").set(auth(other.token)).send({ name: "Карта", kind: "debit_card", openingBalance: "1000.00", openingBalanceDate: TODAY })).body.id;
    await request(app).post("/api/v1/transactions").set(auth(other.token)).send({ type: "expense", accountId: otherAcc, amount: "300", merchant: "SECRET STORE", categoryId: await code("clothes"), date: TODAY });
    const mine = await add({ type: "income", amount: "300", description: "Возврат SECRET STORE" });
    expect((await db.select().from(transactions).where(eq(transactions.id, mine.id)))[0].categoryId).toBeNull();
  });
});
