import { describe, expect, it } from "vitest";
import { LocalStore } from "../src/data/store";
import { nodeSqlite } from "./sqlite";

const A1 = "00000000-0000-4000-8000-000000000001";
const A2 = "00000000-0000-4000-8000-000000000002";
const tx = (n: number, fields: object) => ({ id: `00000000-0000-4000-8000-0000000001${String(n).padStart(2, "0")}`, currency: "RUB", ...fields });

async function seeded() {
  const db = nodeSqlite();
  const store = new LocalStore(db);
  await store.applyPage({
    changes: {
      transactions: [
        tx(1, { accountId: A1, type: "expense", amount: "-150.50", amountRub: "-150.50", date: "2026-10-01", merchant: "Ёлки-Палки", categoryId: "cafe" }),
        tx(2, { accountId: A1, type: "expense", amount: "-99.00", amountRub: "-99.00", date: "2026-10-05", merchant: "ПЯТЁРОЧКА 4021", categoryId: null }),
        tx(3, { accountId: A2, type: "income", amount: "1000.00", amountRub: "1000.00", date: "2026-09-30", description: "Зарплата 100%_бонус", categoryId: "salary" }),
        tx(4, { accountId: A2, type: "transfer", amount: "-500.00", amountRub: "-500.00", date: "2026-10-03", categoryId: null }),
        tx(5, { accountId: A1, type: "expense", amount: "-10.00", currency: "USD", amountRub: null, date: "2026-10-04", note: "кофе в аэропорту" }),
      ],
    },
    deleted: {},
    nextCursor: "c1",
  });
  return { db, store };
}

const ids = (rows: { id: string }[]) => rows.map((row) => Number(row.id.slice(-2)));

describe("лента: фильтры, поиск, итоги", () => {
  it("поиск без учёта регистра по кириллице, ё = е, по получателю, описанию и заметке", async () => {
    const { store } = await seeded();
    expect(ids(await store.list("transactions", { search: "елки" }))).toEqual([1]);
    expect(ids(await store.list("transactions", { search: "пятёроч" }))).toEqual([2]);
    expect(ids(await store.list("transactions", { search: "КОФЕ" }))).toEqual([5]);
    // % и _ — обычные символы, а не шаблон LIKE
    expect(ids(await store.list("transactions", { search: "100%_" }))).toEqual([3]);
    expect(ids(await store.list("transactions", { search: "%" }))).toEqual([3]);
  });

  it("тип, период, счёт, категория, без категории; страницы", async () => {
    const { store } = await seeded();
    expect(ids(await store.list("transactions", { types: ["expense"] }))).toEqual([2, 5, 1]);
    expect(ids(await store.list("transactions", { from: "2026-10-01", to: "2026-10-04" }))).toEqual([5, 4, 1]);
    expect(ids(await store.list("transactions", { accountIds: [A2] }))).toEqual([4, 3]);
    expect(ids(await store.list("transactions", { categoryIds: ["cafe", "salary"] }))).toEqual([1, 3]);
    expect(ids(await store.list("transactions", { uncategorized: true, types: ["expense", "income"] }))).toEqual([2, 5]);
    expect(ids(await store.list("transactions", { uncategorized: true, categoryIds: ["cafe"], types: ["expense"] }))).toEqual([2, 5, 1]);
    expect(ids(await store.list("transactions", { limit: 2, offset: 1 }))).toEqual([5, 4]);
  });

  it("равенство полей записи; имя поля проверяется", async () => {
    const { store } = await seeded();
    expect(ids(await store.list("transactions", { fields: { merchant: "Ёлки-Палки" } }))).toEqual([1]);
    await expect(store.list("transactions", { fields: { "x') OR 1=1 --": "a" } })).rejects.toThrow("Недопустимое поле");
  });

  it("итоги по фильтру в копейках: переводы не доходы и не расходы, сумма без курса не считается", async () => {
    const { store } = await seeded();
    expect(await store.totals("transactions")).toEqual({ income: 100000n, expense: 24950n, count: 5 });
    expect(await store.totals("transactions", { accountIds: [A1] })).toEqual({ income: 0n, expense: 24950n, count: 3 });
  });

  it("строки, записанные до обновления, получают колонки поиска при открытии", async () => {
    const { db } = await seeded();
    db.raw.exec("UPDATE records SET search = NULL, kind = NULL, amount_kop = NULL");
    const reopened = new LocalStore(db);
    expect(ids(await reopened.list("transactions", { search: "елки", types: ["expense"] }))).toEqual([1]);
    expect((await reopened.totals("transactions")).expense).toBe(24950n);
  });

  it("обновление приложения: база первой версии получает новые колонки и заполняет их", async () => {
    const { db } = await seeded();
    // база, какой её оставило приложение до T7
    db.raw.exec(`
      DROP INDEX records_by_kind;
      ALTER TABLE records DROP COLUMN search;
      ALTER TABLE records DROP COLUMN kind;
      ALTER TABLE records DROP COLUMN amount_kop;
      PRAGMA user_version = 1;
    `);
    const upgraded = new LocalStore(db);
    expect(ids(await upgraded.list("transactions", { search: "пятерочка" }))).toEqual([2]);
    expect((db.raw.prepare("PRAGMA user_version").get() as { user_version: number }).user_version).toBe(2);
  });
});
