/**
 * Нейросеть для категорий (E1.3-T8): очистка ПДн, переводы людям не уходят, пачки по 50, глобальный кеш, повтор
 * при невалидном ответе, порог уверенности, флаги, суточный лимит, месячный бюджет. Провайдер — подделка.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { and, eq } from "drizzle-orm";
import { db, accounts, categories, llmUsageDaily, notifications, transactions, users } from "@workspace/db";
import { runLlmCategorization, sanitizeForLlm } from "../src/services/categorization/llm";
import { setLlmProvider, type ChatRequest, type LlmProvider } from "../src/services/llm/provider";
import { app, auth, registerUser, type TestUser } from "./helpers";

const code = async (value: string) => (await db.select().from(categories).where(eq(categories.code, value)))[0].id;
// буквы a–f: цифры очистка вырезает, а кеш общий — названиям нужна уникальность между прогонами
const word = () => `${randomUUID().replace(/[^a-f]/g, "").slice(0, 8)}x`;

type Reply = (batch: Array<{ i: number; text: string; direction: string }>) => string;
const calls: ChatRequest[] = [];
let reply: Reply = () => "{}";
const fake: LlmProvider = {
  name: "fake",
  async chat(req) {
    calls.push(req);
    return { content: reply(JSON.parse(req.messages[1].content)), model: "fake-model", totalTokens: 1000 };
  },
};
const answerAll = (code: string | null, confidence: number): Reply => (batch) =>
  JSON.stringify({ items: batch.map((item) => ({ i: item.i, category_code: code, confidence })) });

const ENV = { LLM_CATEGORIZATION_ENABLED: "true", LLM_CATEGORIZATION_MODEL: "test-model", LLM_PRICE_RUB_PER_1K_TOKENS: "1" };
beforeAll(() => { Object.assign(process.env, ENV); setLlmProvider(fake); });
afterAll(() => { for (const key of [...Object.keys(ENV), "LLM_MONTHLY_BUDGET_RUB"]) delete process.env[key]; setLlmProvider(undefined); });
beforeEach(() => { calls.length = 0; reply = () => "{}"; delete process.env.LLM_MONTHLY_BUDGET_RUB; });

async function owner() {
  const user = await registerUser();
  const [account] = await db.insert(accounts).values({ userId: user.id, accountName: "Карта", kind: "debit_card", balance: "0" }).returning();
  const add = async (merchant: string | null, extra: Partial<typeof transactions.$inferInsert> = {}) =>
    (await db.insert(transactions).values({
      userId: user.id, accountId: account.id, type: "expense", amount: "-750.00", description: merchant ?? "", merchant,
      transactionDate: new Date(), localDate: "2026-10-10", ...extra,
    }).returning())[0].id;
  return { user, add };
}
const row = async (id: string) => (await db.select().from(transactions).where(eq(transactions.id, id)))[0];

describe("очистка перед отправкой", () => {
  it("убирает числа от 4 цифр, e-mail, телефоны, маски карт, договоры; шум и город", () => {
    expect(sanitizeForLlm("OOO ROMASHKA 123456 MOSCOW RUS")).toBe("romashka");
    expect(sanitizeForLlm("Студия Лето mail@studio.ru +7 (916) 123-45-67")).toBe("студия лето");
    expect(sanitizeForLlm("Оплата 220012******1234 GOODS")).toBe("goods");
    expect(sanitizeForLlm("Кафе Уют по договору № 77-1234")).toBe("кафе уют по");
  });

  it("переводы людям, имена и пустые строки — null", () => {
    for (const value of ["Перевод по номеру телефона", "СБП Иванов И.И.", "Petrov P.", "IP SMIRNOVA", "Оплата Сергею", "Анна Петровна", "1234 5678", "", null]) {
      expect(sanitizeForLlm(value), String(value)).toBeNull();
    }
  });
});

describe("категоризация нейросетью", () => {
  it("уверенный ответ — категория llm, неуверенный — предложение; в модель не уходит лишнего", async () => {
    const { user, add } = await owner();
    const sure = word();
    const unsure = word();
    const ids = { sure: await add(`${sure} STORE 40211234`), unsure: await add(`${unsure} SHOP`), p2p: await add("Перевод Иванов И.И."), manual: await add(`${sure} STORE`, { categorySource: "manual", categoryId: await code("other") }) };
    reply = (batch) => JSON.stringify({ items: batch.map((item) => ({ i: item.i, category_code: "shopping.other", confidence: item.text.startsWith(sure) ? 0.9 : 0.4 })) });

    const result = await runLlmCategorization(user.id);
    expect(result).toMatchObject({ items: 2, cacheHits: 0, assigned: 1, suggested: 1 });
    expect(await row(ids.sure)).toMatchObject({ categoryId: await code("shopping.other"), categorySource: "llm", categoryConfidence: 0.9 });
    expect(await row(ids.unsure)).toMatchObject({ categoryId: null, categorySource: "none", suggestedCategoryId: await code("shopping.other") });
    expect(await row(ids.p2p)).toMatchObject({ categorySource: "none", suggestedCategoryId: null });
    expect((await row(ids.manual)).categoryId).toBe(await code("other"));

    expect(calls).toHaveLength(1);
    const sent = calls[0].messages[1].content;
    expect(sent).not.toMatch(/\d{4}/);
    expect(sent).not.toContain(user.id);
    expect(sent).not.toContain("2026-10-10");
    expect(sent.toLowerCase()).not.toContain("иванов");
    expect(calls[0]).toMatchObject({ model: "test-model", jsonSchema: { name: "categories" } });
    const [usage] = await db.select().from(llmUsageDaily).where(eq(llmUsageDaily.userId, user.id));
    expect(usage).toMatchObject({ rows: 2, costKopecks: 100 });
  });

  it("пачки по 50; повторный мерчант у другого пользователя — из кеша, без запроса", async () => {
    const a = await owner();
    const names = Array.from({ length: 60 }, () => word());
    for (const name of names) await a.add(`${name} market`);
    reply = answerAll("food.groceries", 0.8);
    expect((await runLlmCategorization(a.user.id)).assigned).toBe(60);
    expect(calls.map((call) => JSON.parse(call.messages[1].content).length)).toEqual([50, 10]);

    calls.length = 0;
    const b = await owner();
    const id = await b.add(`${names[0]} market`);
    expect(await runLlmCategorization(b.user.id)).toMatchObject({ items: 1, cacheHits: 1, assigned: 1 });
    expect(calls).toHaveLength(0);
    expect((await row(id)).categorySource).toBe("llm");
  });

  it("невалидный ответ — один повтор; два невалидных — без категории; чужой код и код не того вида игнорируются", async () => {
    const { user, add } = await owner();
    const first = await add(`${word()} retry`);
    let attempt = 0;
    reply = (batch) => (attempt++ === 0 ? "не JSON" : answerAll("eat.cafe", 0.9)(batch));
    await runLlmCategorization(user.id, [first]);
    expect(calls).toHaveLength(2);
    expect((await row(first)).categorySource).toBe("llm");

    calls.length = 0;
    const broken = await add(`${word()} broken`);
    reply = () => "{\"oops\": 1}";
    expect((await runLlmCategorization(user.id, [broken])).assigned).toBe(0);
    expect(calls).toHaveLength(2);

    const wrong = [await add(`${word()} unknown`), await add(`${word()} income`)];
    let n = 0;
    reply = (batch) => JSON.stringify({ items: batch.map((item) => ({ i: item.i, category_code: n++ === 0 ? "made.up" : "inc.salary", confidence: 0.95 })) });
    expect((await runLlmCategorization(user.id, wrong)).assigned).toBe(0);
    for (const id of wrong) expect((await row(id)).categorySource).toBe("none");
  });
});

describe("флаги и лимиты", () => {
  it("без флага, без модели или с выключенной настройкой пользователя — ничего не отправляется", async () => {
    const { user, add } = await owner();
    await add(`${word()} flags`);
    reply = answerAll("other", 0.9);
    process.env.LLM_CATEGORIZATION_ENABLED = "false";
    expect((await runLlmCategorization(user.id)).skipped).toBe("disabled");
    process.env.LLM_CATEGORIZATION_ENABLED = "true";
    delete process.env.LLM_CATEGORIZATION_MODEL;
    expect((await runLlmCategorization(user.id)).skipped).toBe("disabled");
    process.env.LLM_CATEGORIZATION_MODEL = "test-model";

    const settings = await request(app).patch("/api/v1/categories/settings").set(auth(user.token)).send({ llm: false });
    expect(settings.body).toEqual({ llm: false, llmAvailable: true });
    expect((await runLlmCategorization(user.id)).skipped).toBe("user_off");
    expect(calls).toHaveLength(0);
  });

  it("суточный лимит строк и месячный бюджет; при исчерпании бюджета администратор получает уведомление", async () => {
    const { user, add } = await owner();
    await add(`${word()} limits`);
    const day = new Date().toISOString().slice(0, 10);
    await db.insert(llmUsageDaily).values({ userId: user.id, day, rows: 2000 });
    expect((await runLlmCategorization(user.id)).skipped).toBe("daily_limit");

    await db.update(llmUsageDaily).set({ rows: 0, costKopecks: 1_000_000_000 }).where(and(eq(llmUsageDaily.userId, user.id), eq(llmUsageDaily.day, day)));
    const admin = await registerUser();
    await db.update(users).set({ adminRole: "super_admin" }).where(eq(users.id, admin.id));
    process.env.LLM_MONTHLY_BUDGET_RUB = "1000";
    expect((await runLlmCategorization(user.id)).skipped).toBe("budget");
    expect(calls).toHaveLength(0);
    const sent = await db.select().from(notifications).where(eq(notifications.userId, admin.id));
    expect(sent.map((n) => n.title)).toContain("Бюджет нейросети на месяц исчерпан");
  });
});

describe("ручной ввод и права", () => {
  it("операция без категории после конвейера уходит в нейросеть; настройки B не меняют настроек A", async () => {
    const a = await registerUser();
    const as = (url: string, body: object) => request(app).post(url).set(auth(a.token)).send(body);
    const acc = (await as("/api/v1/accounts", { name: "Карта", kind: "debit_card", openingBalance: "1000.00", openingBalanceDate: "2026-10-01" })).body.id;
    reply = answerAll("leisure.hobby", 0.85);
    const created = (await as("/api/v1/transactions", { type: "expense", accountId: acc, amount: "300", date: "2026-10-05", merchant: `${word()} atelier` })).body;
    let current = await row(created.id);
    for (let i = 0; i < 40 && current.categorySource !== "llm"; i++) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      current = await row(created.id);
    }
    expect(current).toMatchObject({ categoryId: await code("leisure.hobby"), categorySource: "llm" });

    const b = await registerUser();
    await request(app).patch("/api/v1/categories/settings").set(auth(b.token)).send({ llm: false });
    expect((await request(app).get("/api/v1/categories/settings").set(auth(a.token))).body.llm).toBe(true);
    expect((await request(app).patch("/api/v1/categories/settings").set(auth(a.token)).send({ llm: "yes" })).status).toBe(400);
  });
});
