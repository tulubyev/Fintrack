/**
 * GET /api/v1/sync (E2.1-T4): полный снимок постранично, затем изменения и надгробия по курсору.
 * Главное свойство курсора — не терять изменения долгих транзакций и массовых UPDATE в обход кода.
 */
import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { pool } from "@workspace/db";
import { todayMsk } from "../src/services/budgetService";
import { app, auth, registerUser, type TestUser } from "./helpers";

const TODAY = todayMsk();

interface SyncPage {
  changes: Record<string, { id: string; [key: string]: unknown }[]>;
  deleted: Record<string, string[]>;
  nextCursor: string;
  hasMore: boolean;
}

/** Весь раунд синхронизации: страницы до hasMore = false. */
async function syncRound(user: TestUser, cursor?: string, limit = 3) {
  const changes: Record<string, Map<string, Record<string, unknown>>> = {};
  const deleted: Record<string, Set<string>> = {};
  let pages = 0;
  for (;;) {
    const res = await request(app).get("/api/v1/sync").query({ ...(cursor ? { cursor } : {}), limit }).set(auth(user.token));
    expect(res.status).toBe(200);
    const page = res.body as SyncPage;
    for (const [entity, items] of Object.entries(page.changes)) {
      changes[entity] ??= new Map();
      for (const item of items) changes[entity].set(item.id, item);
    }
    for (const [entity, ids] of Object.entries(page.deleted)) {
      deleted[entity] ??= new Set();
      ids.forEach((id) => deleted[entity].add(id));
    }
    pages++;
    cursor = page.nextCursor;
    if (!page.hasMore) return { changes, deleted, cursor, pages };
    expect(pages).toBeLessThan(200);
  }
}

const post = (user: TestUser, path: string, body: object) => request(app).post(path).set(auth(user.token)).send(body);
const ids = (map: Map<string, unknown> | undefined) => [...(map?.keys() ?? [])];

let a: TestUser;
let b: TestUser;
const created: Record<string, string> = {};

beforeAll(async () => {
  a = await registerUser();
  b = await registerUser();
  created.account = (await post(a, "/api/v1/accounts", { name: "Карта", kind: "debit_card", openingBalance: "10000.00", openingBalanceDate: TODAY })).body.id;
  for (let i = 0; i < 4; i++) {
    const tx = await post(a, "/api/v1/transactions", { type: "expense", accountId: created.account, amount: `${100 + i}.00`, date: TODAY, merchant: `Магазин ${i}` });
    created[`tx${i}`] = tx.body.id;
  }
  created.category = (await post(a, "/api/v1/categories", { name: "Хобби", kind: "expense" })).body.id;
  created.budget = (await post(a, "/api/v1/budgets", { categoryId: created.category, amount: "5000" })).body.id;
  created.goal = (await post(a, "/api/v1/goals", { name: "Отпуск", targetAmount: "100000.00" })).body.id;
  created.contribution = (await post(a, `/api/v1/goals/${created.goal}/contributions`, { amount: "1000.00" })).body.contribution.id;
  created.rule = (await post(a, "/api/v1/category-rules", { field: "merchant", op: "contains", pattern: "Магазин", categoryId: created.category })).body.rule?.id
    ?? (await request(app).get("/api/v1/category-rules").set(auth(a.token))).body.items[0].id;
  // у B свой счёт — у A его быть не должно
  created.otherAccount = (await post(b, "/api/v1/accounts", { name: "Чужая", kind: "cash", openingBalance: "1.00", openingBalanceDate: TODAY })).body.id;
});

describe("полный снимок", () => {
  it("все сущности пользователя постранично, системные категории, без чужих данных", async () => {
    const round = await syncRound(a, undefined, 3);
    expect(round.pages).toBeGreaterThan(3);
    expect(ids(round.changes.accounts)).toEqual([created.account]);
    expect(ids(round.changes.transactions).sort()).toEqual([created.tx0, created.tx1, created.tx2, created.tx3].sort());
    expect(ids(round.changes.budgets)).toEqual([created.budget]);
    expect(ids(round.changes.goals)).toEqual([created.goal]);
    expect(ids(round.changes.goalContributions)).toEqual([created.contribution]);
    expect(ids(round.changes.rules)).toEqual([created.rule]);
    const categories = round.changes.categories!;
    expect(categories.get(created.category)).toMatchObject({ name: "Хобби", isSystem: false, hidden: false });
    expect([...categories.values()].filter((c) => c.isSystem).length).toBeGreaterThan(20);
    // формы совпадают с REST
    expect(round.changes.transactions!.get(created.tx0)).toMatchObject({ accountId: created.account, amount: "-100.00", date: TODAY, merchant: "Магазин 0" });
    expect(round.changes.accounts!.get(created.account)).toMatchObject({ name: "Карта", balance: "9594.00" });
    expect(round.changes.goalContributions!.get(created.contribution)).toMatchObject({ goalId: created.goal, amount: "1000.00" });
    expect(Object.values(round.deleted).every((set) => set.size === 0)).toBe(true);
  });

  it("B не видит данных A: ни счёта, ни операций, ни своей категории A", async () => {
    const round = await syncRound(b, undefined, 500);
    expect(ids(round.changes.accounts)).toEqual([created.otherAccount]);
    expect(ids(round.changes.transactions)).toEqual([]);
    expect(round.changes.categories!.has(created.category)).toBe(false);
    expect(ids(round.changes.budgets)).toEqual([]);
  });
});

describe("изменения по курсору", () => {
  it("правка, удаление, новая запись и скрытие системной категории; нетронутое не приходит", async () => {
    const first = await syncRound(a, undefined, 500);
    const systemCategory = [...first.changes.categories!.values()].find((c) => c.isSystem && c.kind === "expense")!;

    await request(app).patch(`/api/v1/transactions/${created.tx1}`).set(auth(a.token)).send({ note: "исправлено" });
    await request(app).delete(`/api/v1/transactions/${created.tx2}`).set(auth(a.token));
    const fresh = (await post(a, "/api/v1/accounts", { name: "Наличные", kind: "cash", openingBalance: "500.00", openingBalanceDate: TODAY })).body.id;
    await request(app).patch(`/api/v1/categories/${systemCategory.id}`).set(auth(a.token)).send({ hidden: true });

    const next = await syncRound(a, first.cursor, 2);
    expect(next.changes.transactions!.get(created.tx1)).toMatchObject({ note: "исправлено" });
    expect([...next.deleted.transactions!]).toEqual([created.tx2]);
    expect(next.changes.transactions!.has(created.tx2)).toBe(false);
    expect(next.changes.accounts!.has(fresh)).toBe(true);
    expect(next.changes.categories!.get(systemCategory.id as string)).toMatchObject({ hidden: true });
    // остаток карты изменился удалением — счёт тоже пришёл
    expect(next.changes.accounts!.has(created.account)).toBe(true);
    // нетронутое не отдаётся
    expect(next.changes.budgets!.size).toBe(0);
    expect(next.changes.goals!.size).toBe(0);
    expect(next.changes.transactions!.has(created.tx3)).toBe(false);

    // курсор B не меняется от действий A
    const bFirst = await syncRound(b, undefined, 500);
    const bNext = await syncRound(b, bFirst.cursor, 500);
    expect(ids(bNext.changes.categories)).toEqual([]);
  });

  it("долгая транзакция: изменение, закоммиченное после раунда, приходит в следующем", async () => {
    const before = await syncRound(a, undefined, 500);
    // отдельное соединение из пула приложения — как долгий импорт в соседнем запросе
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("UPDATE transactions SET note = 'из долгого импорта' WHERE id = $1", [created.tx3]);
      // пока транзакция открыта, клиент успевает пройти раунд целиком
      const during = await syncRound(a, before.cursor, 500);
      expect(during.changes.transactions?.has(created.tx3) ?? false).toBe(false);
      await client.query("COMMIT");

      const after = await syncRound(a, during.cursor, 500);
      expect(after.changes.transactions!.get(created.tx3)).toMatchObject({ note: "из долгого импорта" });
    } finally {
      client.release();
    }
  });

  it("массовый UPDATE в обход кода обновляет и курсор, и updated_at; запись без изменений — нет", async () => {
    const before = await syncRound(a, undefined, 500);
    const oldUpdatedAt = before.changes.transactions!.get(created.tx0)!.updatedAt as string;
    await pool.query("UPDATE transactions SET note = 'массово' WHERE id = $1", [created.tx0]);
    await pool.query("UPDATE budgets SET amount = amount WHERE id = $1", [created.budget]);
    const after = await syncRound(a, before.cursor, 500);
    const tx = after.changes.transactions!.get(created.tx0)!;
    expect(tx.note).toBe("массово");
    expect(new Date(tx.updatedAt as string).getTime()).toBeGreaterThan(new Date(oldUpdatedAt).getTime());
    expect(after.changes.budgets!.has(created.budget)).toBe(false);
  });
});

describe("курсор", () => {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");

  it("старше 90 дней — 410 CURSOR_EXPIRED; испорченный — 400; без входа — 401", async () => {
    const stale = encode({ v: 1, lo: "1", t: Date.now() - 91 * 24 * 60 * 60 * 1000, w: null, wt: null, e: 0, x: null, id: null });
    const expired = await request(app).get("/api/v1/sync").query({ cursor: stale }).set(auth(a.token));
    expect(expired.status).toBe(410);
    expect(expired.body.error.code).toBe("CURSOR_EXPIRED");

    const broken = await request(app).get("/api/v1/sync").query({ cursor: "не курсор" }).set(auth(a.token));
    expect(broken.status).toBe(400);
    expect((await request(app).get("/api/v1/sync").query({ limit: 5000 }).set(auth(a.token))).status).toBe(400);
    expect((await request(app).get("/api/v1/sync")).status).toBe(401);
  });
});
