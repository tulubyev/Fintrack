/**
 * Свои категории и настройки системных (E1.3-T2): создание (два уровня, вид как у родителя, имя без повторов),
 * идемпотентность по id, правка своих, скрытие и переименование системных, удаление с переносом операций,
 * бюджетов и регулярных платежей, права.
 */
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { db, budgets, categories, recurringSeries, transactions } from "@workspace/db";
import { todayMsk } from "../src/services/budgetService";
import { app, auth, registerUser, type TestUser } from "./helpers";

const TODAY = todayMsk();
const code = async (value: string) => (await db.select().from(categories).where(eq(categories.code, value)))[0].id;
const as = (user: TestUser) => ({
  get: (url: string) => request(app).get(url).set(auth(user.token)),
  post: (url: string, body: object) => request(app).post(url).set(auth(user.token)).send(body),
  patch: (url: string, body: object) => request(app).patch(url).set(auth(user.token)).send(body),
  delete: (url: string, body?: object) => request(app).delete(url).set(auth(user.token)).send(body ?? {}),
});
interface Node { id: string; name: string; hidden: boolean; isSystem: boolean; children: Node[] }
const find = (nodes: Node[], id: string): Node | undefined => nodes.flatMap((n) => [n, ...n.children]).find((n) => n.id === id);

let a: TestUser;
let pets: string;
let food: string;
beforeAll(async () => {
  a = await registerUser();
  [pets, food] = [await code("pets"), await code("food")];
});

describe("POST /api/v1/categories", () => {
  it("подкатегория под системной и своя верхнего уровня; повтор по id — та же категория", async () => {
    const id = randomUUID();
    const dog = await as(a).post("/api/v1/categories", { id, name: "Собака", kind: "expense", parentId: pets, icon: "dog" });
    expect(dog.status, JSON.stringify(dog.body)).toBe(201);
    expect(dog.body).toMatchObject({ id, name: "Собака", isSystem: false, kind: "expense", icon: "dog" });
    expect((await as(a).post("/api/v1/categories", { id, name: "Собака", kind: "expense", parentId: pets })).status).toBe(200);

    const own = await as(a).post("/api/v1/categories", { name: "Хобби-проекты", kind: "expense" });
    expect(own.status).toBe(201);
    const tree = (await as(a).get("/api/v1/categories?kind=expense")).body.items as Node[];
    expect(find(tree, pets)!.children.map((c) => c.name)).toContain("Собака");
    expect(tree.map((n) => n.name)).toContain("Хобби-проекты");
  });

  it("ошибки: третий уровень, вид не как у родителя, перевод, имя занято (в т. ч. системным)", async () => {
    const groceries = await code("food.groceries");
    expect((await as(a).post("/api/v1/categories", { name: "Глубоко", kind: "expense", parentId: groceries })).status).toBe(400);
    expect((await as(a).post("/api/v1/categories", { name: "Не тот вид", kind: "income", parentId: food })).status).toBe(400);
    expect((await as(a).post("/api/v1/categories", { name: "Мой перевод", kind: "transfer" })).status).toBe(400);
    expect((await as(a).post("/api/v1/categories", { name: "продукты", kind: "expense" })).status).toBe(409);
    expect((await as(a).post("/api/v1/categories", { name: "Супермаркеты", kind: "expense", parentId: food })).status).toBe(409);
  });
});

describe("PATCH /api/v1/categories/:id", () => {
  it("системную — только скрыть и переименовать для себя; код и место не меняются", async () => {
    const beauty = await code("beauty");
    const renamed = await as(a).patch(`/api/v1/categories/${beauty}`, { customName: "Барбершоп" });
    expect(renamed.body).toMatchObject({ name: "Барбершоп", isSystem: true });
    expect((await as(a).patch(`/api/v1/categories/${beauty}`, { name: "Другое" })).status).toBe(403);
    expect((await as(a).patch(`/api/v1/categories/${beauty}`, { hidden: true })).body).toMatchObject({ hidden: true, name: "Барбершоп" });
    expect(find((await as(a).get("/api/v1/categories")).body.items, beauty)).toBeUndefined();
    expect((await as(a).patch(`/api/v1/categories/${beauty}`, { customName: null, hidden: false })).body).toMatchObject({ name: "Красота и уход", hidden: false });
    expect((await as(a).patch(`/api/v1/categories/${await code("xfer.own")}`, { hidden: true })).status).toBe(403);
  });

  it("свою — переименовать, перенести под родителя; скрыть нельзя; подкатегорию с детьми нельзя вложить", async () => {
    const parent = (await as(a).post("/api/v1/categories", { name: "Дача", kind: "expense" })).body.id;
    const child = (await as(a).post("/api/v1/categories", { name: "Рассада", kind: "expense", parentId: parent })).body.id;
    expect((await as(a).patch(`/api/v1/categories/${child}`, { name: "Семена и рассада", color: "#22aa44" })).body).toMatchObject({ name: "Семена и рассада", color: "#22aa44" });
    expect((await as(a).patch(`/api/v1/categories/${child}`, { hidden: true })).status).toBe(400);
    expect((await as(a).patch(`/api/v1/categories/${parent}`, { parentId: await code("home") })).status).toBe(400);
    expect((await as(a).patch(`/api/v1/categories/${child}`, { parentId: await code("home") })).status).toBe(200);
    expect(find((await as(a).get("/api/v1/categories")).body.items, await code("home"))!.children.map((c) => c.name)).toContain("Семена и рассада");
  });
});

describe("DELETE /api/v1/categories/:id", () => {
  it("операции, бюджеты и регулярные платежи переходят в замену; подкатегории удаляются вместе", async () => {
    const user = await registerUser();
    const acc = (await as(user).post("/api/v1/accounts", { name: "Карта", kind: "debit_card", openingBalance: "10000.00", openingBalanceDate: TODAY })).body.id;
    const garden = (await as(user).post("/api/v1/categories", { name: "Сад", kind: "expense" })).body.id;
    const seeds = (await as(user).post("/api/v1/categories", { name: "Семена", kind: "expense", parentId: garden })).body.id;
    await as(user).post("/api/v1/transactions", { type: "expense", accountId: acc, categoryId: garden, amount: "100", date: TODAY });
    await as(user).post("/api/v1/transactions", { type: "expense", accountId: acc, categoryId: seeds, amount: "50", date: TODAY });
    const budget = (await as(user).post("/api/v1/budgets", { categoryId: garden, amount: "1000" })).body.id;
    const home = await code("home");

    expect((await as(user).delete(`/api/v1/categories/${garden}`)).status).toBe(400);
    expect((await as(user).delete(`/api/v1/categories/${garden}`, { replaceWithId: seeds })).status).toBe(400);
    expect((await as(user).delete(`/api/v1/categories/${garden}`, { replaceWithId: await code("inc.salary") })).status).toBe(400);
    expect((await as(user).delete(`/api/v1/categories/${home}`, { replaceWithId: food })).status).toBe(403);

    const res = await as(user).delete(`/api/v1/categories/${garden}`, { replaceWithId: home });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({ movedTransactions: 2, movedBudgets: 1, removedBudgets: 0 });
    const txs = await db.select().from(transactions).where(eq(transactions.accountId, acc));
    expect(txs.every((t) => t.categoryId === home)).toBe(true);
    expect((await db.select().from(budgets).where(eq(budgets.id, budget)))[0].categoryId).toBe(home);
    const tree = (await as(user).get("/api/v1/categories?includeHidden=true")).body.items as Node[];
    expect(find(tree, garden)).toBeUndefined();
    expect(find(tree, seeds)).toBeUndefined();
  });

  it("у замены уже есть бюджет — бюджет удаляемой категории удаляется, а не сливается; регулярный платёж переходит", async () => {
    const user = await registerUser();
    const car = (await as(user).post("/api/v1/categories", { name: "Мотоцикл", kind: "expense" })).body.id;
    const auto = await code("auto");
    const own = (await as(user).post("/api/v1/budgets", { categoryId: car, amount: "500" })).body.id;
    await as(user).post("/api/v1/budgets", { categoryId: auto, amount: "5000" });
    const [series] = await db.insert(recurringSeries).values({
      userId: user.id, groupKey: `moto ${randomUUID()}`, displayName: "Страховка мото", direction: "out", kind: "other", categoryId: car,
      currency: "RUB", periodicity: "yearly", intervalDays: 365, amountLast: "3000", amountMedian: "3000", amountMin: "3000", amountMax: "3000",
      occurrences: 2, firstDate: "2025-05-01", lastDate: "2026-05-01", confidence: 0.8,
    }).returning();
    const res = await as(user).delete(`/api/v1/categories/${car}`, { replaceWithId: auto });
    expect(res.body).toMatchObject({ movedBudgets: 0, removedBudgets: 1 });
    expect((await db.select().from(budgets).where(eq(budgets.id, own)))[0].deletedAt).not.toBeNull();
    expect((await db.select().from(recurringSeries).where(eq(recurringSeries.id, series.id)))[0].categoryId).toBe(auto);
  });
});

describe("права", () => {
  it("B не видит, не меняет и не удаляет категории A; не может перенести свои операции в категорию A", async () => {
    const b = await registerUser();
    const mine = (await as(a).post("/api/v1/categories", { name: `Секретная ${randomUUID().slice(0, 4)}`, kind: "expense" })).body.id;
    expect(find((await as(b).get("/api/v1/categories?includeHidden=true")).body.items, mine)).toBeUndefined();
    expect((await as(b).patch(`/api/v1/categories/${mine}`, { name: "Взлом" })).status).toBe(404);
    expect((await as(b).delete(`/api/v1/categories/${mine}`, { replaceWithId: food })).status).toBe(404);
    expect((await as(b).post("/api/v1/categories", { name: "Под чужой", kind: "expense", parentId: mine })).status).toBe(404);
    const bOwn = (await as(b).post("/api/v1/categories", { name: "Моя", kind: "expense" })).body.id;
    expect((await as(b).delete(`/api/v1/categories/${bOwn}`, { replaceWithId: mine })).status).toBe(404);
    expect((await db.select().from(categories).where(eq(categories.id, mine)))[0]).toMatchObject({ deletedAt: null, userId: a.id });
  });
});

describe("GET /api/v1/categories/frequent", () => {
  it("частые за полгода по убыванию; скрытые, другого вида и чужие не входят", async () => {
    const user = await registerUser();
    const other = await registerUser();
    const acc = (await as(user).post("/api/v1/accounts", { name: "Карта", kind: "debit_card", openingBalance: "10000.00", openingBalanceDate: TODAY })).body.id;
    const otherAcc = (await as(other).post("/api/v1/accounts", { name: "Карта", kind: "debit_card", openingBalance: "10000.00", openingBalanceDate: TODAY })).body.id;
    const [taxi, cafe, beauty] = [await code("transport.taxi"), await code("eat.cafe"), await code("beauty")];
    const spend = (who: TestUser, account: string, categoryId: string) => as(who).post("/api/v1/transactions", { type: "expense", accountId: account, categoryId, amount: "10", date: TODAY });
    for (let i = 0; i < 3; i++) await spend(user, acc, cafe);
    await spend(user, acc, taxi);
    await spend(user, acc, beauty);
    for (let i = 0; i < 5; i++) await spend(other, otherAcc, await code("pets"));
    await as(user).post("/api/v1/transactions", { type: "income", accountId: acc, categoryId: await code("inc.salary"), amount: "10", date: TODAY });
    await as(user).patch(`/api/v1/categories/${beauty}`, { hidden: true });

    const res = await as(user).get("/api/v1/categories/frequent?kind=expense");
    expect(res.status).toBe(200);
    expect(res.body.ids[0]).toBe(cafe);
    expect(res.body.ids).toContain(taxi);
    expect(res.body.ids).not.toContain(beauty);
    expect(res.body.ids).not.toContain(await code("pets"));
    expect(res.body.ids).not.toContain(await code("inc.salary"));
    expect((await as(user).get("/api/v1/categories/frequent?kind=transfer")).status).toBe(400);
  });
});
