/**
 * Миграция 0014 (E1.3-T3): строковые категории v1 операций и бюджетов переходят на справочник. Тест заводит строки
 * в духе v1 и прогоняет SQL миграции ещё раз — она обязана быть повторяемой.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db, pool, accounts, budgets, categories, transactions } from "@workspace/db";
import { registerUser, type TestUser } from "./helpers";

const SQL = readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../lib/db/migrations/0014_legacy_categories.sql"), "utf8");
const runMigration = async () => {
  for (const statement of SQL.split("--> statement-breakpoint")) await pool.query(statement);
};
const code = async (value: string) => (await db.select().from(categories).where(eq(categories.code, value)))[0].id;
const today = new Date().toISOString().slice(0, 10);

let user: TestUser;
let accountId: string;
const tx = async (type: "expense" | "income" | "transfer", category: string | null, extra: Partial<typeof transactions.$inferInsert> = {}) =>
  (await db.insert(transactions).values({
    userId: user.id, accountId, type, category, description: "v1", transactionDate: new Date(), localDate: today,
    amount: type === "income" ? "100.00" : "-100.00", ...extra,
  }).returning())[0].id;
const txById = async (id: string) => (await db.select().from(transactions).where(eq(transactions.id, id)))[0];

beforeAll(async () => {
  user = await registerUser();
  [{ id: accountId }] = await db.insert(accounts).values({ userId: user.id, accountName: "Карта", kind: "debit_card", balance: "0" }).returning();
});

describe("операции", () => {
  it("словарь v1, затем название категории того же вида; источник — keyword", async () => {
    const [dog] = await db.insert(categories).values({ userId: user.id, name: "Собака", kind: "expense" }).returning();
    const ids = {
      food: await tx("expense", "продукты"),
      eat: await tx("expense", " Рестораны "), // словарь важнее системной подкатегории «Рестораны»
      p2p: await tx("expense", "переводы"),
      incP2p: await tx("income", "переводы"),
      salary: await tx("income", "зарплата"),
      taxi: await tx("expense", "Такси"),
      dog: await tx("expense", "собака"),
    };
    await runMigration();
    const expected: Record<keyof typeof ids, string> = {
      food: await code("food"), eat: await code("eat"), p2p: await code("p2p"), incP2p: await code("inc.p2p"),
      salary: await code("inc.salary"), taxi: await code("transport.taxi"), dog: dog.id,
    };
    for (const [key, id] of Object.entries(ids)) {
      expect(await txById(id), key).toMatchObject({ categoryId: expected[key as keyof typeof ids], categorySource: "keyword" });
    }
  });

  it("не трогает: категорию другого вида, переводы, ручную разметку, уже размеченные и неизвестные строки", async () => {
    const [other] = await db.insert(categories).values({ userId: (await registerUser()).id, name: "Рыбалка на льду", kind: "expense" }).returning();
    const food = await code("food");
    const ids = [
      await tx("income", "продукты"),
      await tx("transfer", "переводы", { amount: "-100.00" }),
      await tx("expense", "транспорт", { categorySource: "manual" }),
      await tx("expense", "транспорт", { categoryId: food, categorySource: "rule_user" }),
      await tx("expense", "рыбалка на льду"), // своя категория с таким названием есть только у другого пользователя
      await tx("expense", null),
    ];
    const before = await db.select().from(transactions).where(inArray(transactions.id, ids));
    await runMigration();
    const after = await db.select().from(transactions).where(inArray(transactions.id, ids));
    expect(after.map((t) => [t.categoryId, t.categorySource])).toEqual(before.map((t) => [t.categoryId, t.categorySource]));
    expect(after.some((t) => t.categoryId === other.id)).toBe(false);
  });
});

describe("бюджеты", () => {
  it("бюджет на своей категории из 0006 переходит на системную, пустая категория удаляется; повтор ничего не меняет", async () => {
    const owner = await registerUser();
    const [legacy] = await db.insert(categories).values({ userId: owner.id, name: "рестораны", kind: "expense" }).returning();
    const [budget] = await db.insert(budgets).values({ userId: owner.id, categoryId: legacy.id, category: "рестораны", amount: "5000", effectiveFrom: "2026-01-01", effectiveTo: "2026-01-31" }).returning();
    await runMigration();
    const [moved] = await db.select().from(budgets).where(eq(budgets.id, budget.id));
    expect(moved.categoryId).toBe(await code("eat"));
    expect((await db.select().from(categories).where(eq(categories.id, legacy.id)))[0].deletedAt).not.toBeNull();

    await runMigration();
    expect((await db.select().from(budgets).where(eq(budgets.id, budget.id)))[0].updatedAt).toEqual(moved.updatedAt);
  });

  it("на системной категории уже есть бюджет за тот же месяц — бюджет и своя категория остаются; категория с заглавной не удаляется", async () => {
    const owner = await registerUser();
    const utilities = await code("home.utilities");
    const [legacy] = await db.insert(categories).values({ userId: owner.id, name: "коммуналка", kind: "expense" }).returning();
    const [budget] = await db.insert(budgets).values({ userId: owner.id, categoryId: legacy.id, category: "коммуналка", amount: "3000", effectiveFrom: "2026-02-01", effectiveTo: "2026-02-28" }).returning();
    await db.insert(budgets).values({ userId: owner.id, categoryId: utilities, amount: "4000", effectiveFrom: "2026-01-01" });
    const [human] = await db.insert(categories).values({ userId: owner.id, name: "Прочее", kind: "expense", parentId: await code("home") }).returning();
    await runMigration();
    expect((await db.select().from(budgets).where(eq(budgets.id, budget.id)))[0].categoryId).toBe(legacy.id);
    const rows = await db.select().from(categories).where(inArray(categories.id, [legacy.id, human.id]));
    expect(rows.every((c) => c.deletedAt === null)).toBe(true);
  });
});
