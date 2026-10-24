import { describe, expect, it } from "vitest";
import { ApiRequestError, type RequestOptions } from "@workspace/shared/api";
import { handleSessionEvent } from "../src/data/session";
import { LocalStore, retryDelay } from "../src/data/store";
import { describeSync, SyncEngine, type SyncState } from "../src/data/sync";
import { createTransaction, deleteTransaction, updateTransaction } from "../src/data/transactions";
import { uuidv7 } from "../src/data/uuid";
import { nodeSqlite } from "./sqlite";

type Row = Record<string, unknown> & { id: string };

const ACCOUNT = "00000000-0000-4000-8000-000000000001";
const TX1 = "00000000-0000-4000-8000-0000000000a1";
const TX2 = "00000000-0000-4000-8000-0000000000a2";

/**
 * Сервер в памяти: GET /api/v1/sync с курсором-номером версии и надгробиями, операции v1 с клиентским id.
 * mode — что сделать со следующими запросами записи: offline (нет ответа), lost (запрос дошёл, ответ потерян), 503.
 */
function fakeServer() {
  let version = 0;
  const tables: Record<string, Map<string, { row: Row; version: number; deleted: boolean }>> = { accounts: new Map(), transactions: new Map() };
  const log: string[] = [];
  const state = { mode: "ok" as "ok" | "offline" | "lost" | "503", expired: false, unauthorized: false };

  const put = (entity: string, row: Row, deleted = false) => {
    version++;
    tables[entity].set(row.id, { row: { ...row, updatedAt: `v${version}` }, version, deleted });
  };
  const live = (entity: string, id: string) => {
    const entry = tables[entity].get(id);
    return entry && !entry.deleted ? entry.row : undefined;
  };
  const fail = (status: number, code: string, message = code) => {
    throw new ApiRequestError(status, code, message);
  };

  function write(method: string, path: string, body: Record<string, unknown>) {
    const [, , , , id] = path.split("/");
    if (method === "POST") {
      const existing = tables.transactions.get(String(body.id));
      if (existing) {
        const same = existing.row.amount === (body.type === "expense" ? `-${body.amount}` : body.amount);
        if (same && !existing.deleted) return existing.row;
        fail(409, "DUPLICATE_RESOURCE", "Операция с таким id уже существует");
      }
      if (body.amount === "0.00") fail(400, "VALIDATION_ERROR", "Сумма должна быть больше нуля");
      const amount = body.type === "expense" ? `-${body.amount}` : String(body.amount);
      put("transactions", { ...body, id: String(body.id), amount, source: "manual", categorySource: body.categoryId ? "manual" : null } as Row);
      return live("transactions", String(body.id));
    }
    const current = live("transactions", id);
    if (!current) fail(404, "NOT_FOUND", "Операция не найдена");
    if (method === "PATCH") {
      if (body.date === "1999-01-01") fail(409, "OPERATION_NOT_ALLOWED", "Дату импортированной операции менять нельзя");
      const next: Row = { ...current!, ...body };
      if (body.amount !== undefined) next.amount = (body.type ?? current!.type) === "expense" ? `-${body.amount}` : String(body.amount);
      put("transactions", next);
      return { transaction: live("transactions", id) };
    }
    put("transactions", current!, true);
    return undefined;
  }

  const request = async <T>(path: string, init: RequestOptions = {}): Promise<T> => {
    const method = init.method ?? "GET";
    if (state.unauthorized) fail(401, "UNAUTHORIZED");
    if (method === "GET" && path === "/api/v1/sync") {
      if (state.mode === "offline") throw new TypeError("Network request failed");
      const cursor = init.query?.cursor ? Number(init.query.cursor) : null;
      if (cursor !== null && state.expired) fail(410, "CURSOR_EXPIRED");
      const limit = Number(init.query?.limit ?? 500);
      const all = Object.entries(tables)
        .flatMap(([entity, rows]) => [...rows.values()].map((entry) => ({ entity, ...entry })))
        .filter((entry) => (cursor === null ? !entry.deleted : entry.version > cursor))
        .sort((a, b) => a.version - b.version);
      const page = all.slice(0, limit);
      const changes: Record<string, Row[]> = {};
      const deleted: Record<string, string[]> = {};
      for (const entry of page) {
        if (entry.deleted) (deleted[entry.entity] ??= []).push(entry.row.id);
        else (changes[entry.entity] ??= []).push(entry.row);
      }
      const last = page.length ? page[page.length - 1].version : cursor ?? version;
      return { changes, deleted, nextCursor: String(page.length < all.length ? last : Math.max(last, version)), hasMore: page.length < all.length } as T;
    }
    log.push(`${method} ${path}`);
    if (state.mode === "offline") throw new TypeError("Network request failed");
    if (state.mode === "503") fail(503, "SERVICE_UNAVAILABLE", "Сервис временно недоступен");
    const result = write(method, path, (init.body ?? {}) as Record<string, unknown>);
    if (state.mode === "lost") throw new TypeError("Network request failed");
    return result as T;
  };

  put("accounts", { id: ACCOUNT, name: "Карта", currency: "RUB", balance: "1000.00" });
  return { request, tables, log, state, put, live };
}

async function setup(server = fakeServer()) {
  let now = 1_000_000;
  const db = nodeSqlite();
  const store = new LocalStore(db, () => now);
  await store.open();
  const engine = new SyncEngine({ store, request: server.request, now: () => now });
  await engine.init();
  engine.stop(); // в тестах раунды запускаем сами, без таймеров
  const sync = async (options?: { now?: boolean }) => {
    (engine as unknown as { stopped: boolean }).stopped = false;
    await engine.sync(options);
    engine.stop();
  };
  return { server, store, engine, sync, db, advance: (ms: number) => (now += ms) };
}

const expense = (amount = "150.00") => ({ accountId: ACCOUNT, type: "expense" as const, amount, date: "2026-10-24", merchant: "Кофейня" });

describe("синхронизация с сервера", () => {
  it("первый раунд — полный снимок, дальше — изменения и надгробия по курсору", async () => {
    const { server, store, sync } = await setup();
    server.put("transactions", { id: TX1, accountId: ACCOUNT, type: "expense", amount: "-10.00", date: "2026-10-01" });
    server.put("transactions", { id: TX2, accountId: ACCOUNT, type: "expense", amount: "-20.00", date: "2026-10-02" });
    await sync();
    expect(await store.count("accounts")).toBe(1);
    expect((await store.list<Row>("transactions")).map((row) => row.id)).toEqual([TX2, TX1]); // новые даты — первыми
    expect(await store.getKv("sync.cursor")).not.toBeNull();

    server.put("transactions", { ...server.live("transactions", TX1)!, merchant: "Аптека" });
    server.put("transactions", server.live("transactions", TX2)!, true);
    await sync();
    expect(await store.get("transactions", TX1)).toMatchObject({ merchant: "Аптека" });
    expect(await store.get("transactions", TX2)).toBeNull();
  });

  it("большой объём листается страницами", async () => {
    const { server, store, engine } = await setup();
    for (let i = 0; i < 25; i++) server.put("transactions", { id: uuidv7(() => new Uint8Array(16).map(() => i), 1_700_000_000_000 + i), date: "2026-10-01" });
    const paged = new SyncEngine({ store, request: server.request, pageLimit: 7 });
    paged.stop();
    (paged as unknown as { stopped: boolean }).stopped = false;
    await paged.sync();
    paged.stop();
    engine.stop();
    expect(await store.count("transactions")).toBe(25);
  });

  it("курсор устарел (410) — полный ресинк: устаревшее стёрто, неотправленное сохранено", async () => {
    const { server, store, sync } = await setup();
    server.put("transactions", { id: TX1, accountId: ACCOUNT, amount: "-10.00", date: "2026-10-01" });
    await sync();
    // на сервере TX1 удалили давно — надгробие уже не придёт
    server.tables.transactions.delete(TX1);
    server.state.mode = "offline";
    await createTransaction(store, TX2, expense());
    server.state.mode = "ok";
    server.state.expired = true;
    const original = server.request;
    let resynced = false;
    server.state.expired = true;
    const request = async <T>(path: string, init?: RequestOptions) => {
      if (path === "/api/v1/sync" && !init?.query?.cursor) resynced = true;
      if (resynced) server.state.expired = false;
      return original<T>(path, init);
    };
    const engine = new SyncEngine({ store, request });
    await engine.sync();
    engine.stop();
    expect(resynced).toBe(true);
    expect(await store.get("transactions", TX1)).toBeNull();
    expect(server.live("transactions", TX2)).toBeTruthy();
    expect(await store.get("transactions", TX2)).toMatchObject({ amount: "-150.00" });
  });
});

describe("запись без сети", () => {
  it("трата видна сразу, ждёт в очереди и уходит при появлении сети", async () => {
    const { server, store, engine, sync } = await setup();
    await sync();
    server.state.mode = "offline";
    await createTransaction(store, TX1, expense());
    expect(await store.get("transactions", TX1)).toMatchObject({ amount: "-150.00", currency: "RUB", source: "manual", merchant: "Кофейня" });
    await sync();
    expect(engine.getState()).toMatchObject({ phase: "offline", pending: 1 });

    server.state.mode = "ok";
    await sync({ now: true });
    expect(engine.getState()).toMatchObject({ phase: "idle", pending: 0 });
    expect(server.live("transactions", TX1)).toMatchObject({ amount: "-150.00", merchant: "Кофейня" });
    // после синхронизации локальная запись — серверная версия
    expect(await store.get("transactions", TX1)).toMatchObject({ updatedAt: server.live("transactions", TX1)!.updatedAt });
  });

  it("ответ на создание потерялся — повтор с тем же id не создаёт дубль", async () => {
    const { server, store, sync } = await setup();
    await sync();
    server.state.mode = "lost";
    await createTransaction(store, TX1, expense());
    await sync();
    expect(server.tables.transactions.size).toBe(1);
    server.state.mode = "ok";
    await sync({ now: true });
    expect(server.log.filter((line) => line.startsWith("POST"))).toHaveLength(2);
    expect(server.tables.transactions.size).toBe(1);
    expect((await store.outboxSummary()).pending).toBe(0);
  });

  it("создание и правка до отправки — один запрос с итоговыми полями; создание и удаление — ни одного", async () => {
    const { server, store, sync } = await setup();
    await sync();
    server.state.mode = "offline";
    await createTransaction(store, TX1, expense());
    await updateTransaction(store, TX1, { amount: "200.00", merchant: "Пекарня" });
    expect(await store.get("transactions", TX1)).toMatchObject({ amount: "-200.00", merchant: "Пекарня" });
    await createTransaction(store, TX2, expense("1.00"));
    await deleteTransaction(store, TX2);
    expect(await store.get("transactions", TX2)).toBeNull();

    server.state.mode = "ok";
    await sync();
    expect(server.log).toEqual([`POST /api/v1/transactions`]);
    expect(server.live("transactions", TX1)).toMatchObject({ amount: "-200.00", merchant: "Пекарня" });
  });

  it("удаление: запись скрыта сразу; уже удалённая на сервере (404) — тоже успех", async () => {
    const { server, store, sync } = await setup();
    server.put("transactions", { id: TX1, accountId: ACCOUNT, amount: "-10.00", date: "2026-10-01" });
    server.put("transactions", { id: TX2, accountId: ACCOUNT, amount: "-20.00", date: "2026-10-01" });
    await sync();
    await deleteTransaction(store, TX1);
    await deleteTransaction(store, TX2);
    expect(await store.count("transactions")).toBe(0);
    server.tables.transactions.delete(TX2); // удалили напрямую, без надгробия
    await sync();
    expect(server.tables.transactions.get(TX1)?.deleted).toBe(true);
    expect(await store.outboxSummary()).toMatchObject({ pending: 0, conflicts: 0, failed: 0 });
  });

  it("5xx — повтор с растущей паузой; «обновить» жестом не ждёт паузу", async () => {
    const { server, store, engine, sync, advance } = await setup();
    await sync();
    server.state.mode = "503";
    await createTransaction(store, TX1, expense());
    await sync();
    expect(engine.getState()).toMatchObject({ phase: "idle", pending: 1 });
    expect(await store.nextRetryAt()).toBe(1_000_000 + retryDelay(1));
    await sync(); // пауза не прошла — запрос не уходит
    expect(server.log).toHaveLength(1);
    advance(retryDelay(1));
    await sync();
    expect(server.log).toHaveLength(2);
    expect(await store.nextRetryAt()).toBe(1_000_000 + retryDelay(1) + retryDelay(2));

    server.state.mode = "ok";
    await sync({ now: true });
    expect(server.live("transactions", TX1)).toBeTruthy();
    expect(retryDelay(30)).toBe(15 * 60_000);
  });

  it("сессия не обновилась (401) — правка остаётся в очереди", async () => {
    const { server, store, engine, sync } = await setup();
    await sync();
    await createTransaction(store, TX1, expense());
    server.state.unauthorized = true;
    await sync();
    expect(engine.getState()).toMatchObject({ phase: "error", pending: 1 });
    server.state.unauthorized = false;
    await sync();
    expect(server.live("transactions", TX1)).toBeTruthy();
  });

  it("порядок соблюдается: правки уходят в том порядке, в каком сделаны", async () => {
    const { server, store, sync } = await setup();
    await sync();
    server.state.mode = "offline";
    await createTransaction(store, TX1, expense());
    await createTransaction(store, TX2, expense("2.00"));
    await updateTransaction(store, TX1, { categoryId: null }, "future");
    server.state.mode = "ok";
    await sync();
    expect(server.log).toEqual(["POST /api/v1/transactions", "POST /api/v1/transactions", `PATCH /api/v1/transactions/${TX1}`]);
  });
});

describe("ошибки и конфликты", () => {
  it("сервер отклонил правку (4xx) — локальная запись как на сервере, ошибка ждёт пользователя", async () => {
    const { server, store, engine, sync } = await setup();
    server.put("transactions", { id: TX1, accountId: ACCOUNT, type: "expense", amount: "-10.00", date: "2026-10-01", source: "import" });
    await sync();
    await updateTransaction(store, TX1, { date: "1999-01-01" });
    expect(await store.get("transactions", TX1)).toMatchObject({ date: "1999-01-01" });
    await sync();
    expect(await store.get("transactions", TX1)).toMatchObject({ date: "2026-10-01" });
    expect(engine.getState()).toMatchObject({ failed: 1, pending: 0 });
    const [issue] = await store.issues();
    expect(issue).toMatchObject({ status: "failed", error: "Дату импортированной операции менять нельзя" });

    await store.takeServer(issue.seq);
    expect(await store.issues()).toEqual([]);
  });

  it("новая запись отклонена — исчезает с устройства, ошибка остаётся", async () => {
    const { store, sync } = await setup();
    await sync();
    await createTransaction(store, TX1, expense("0.00"));
    await sync();
    expect(await store.get("transactions", TX1)).toBeNull();
    expect(await store.issues()).toMatchObject([{ kind: "create", status: "failed", error: "Сумма должна быть больше нуля" }]);
  });

  it("разные поля изменили здесь и на другом устройстве — сливаются без вопросов", async () => {
    const { server, store, engine, sync } = await setup();
    server.put("transactions", { id: TX1, accountId: ACCOUNT, type: "expense", amount: "-10.00", date: "2026-10-01", merchant: "Кофе", note: null });
    await sync();
    server.state.mode = "offline";
    await updateTransaction(store, TX1, { merchant: "Кофейня у дома" });
    server.put("transactions", { ...server.live("transactions", TX1)!, note: "с коллегой" });
    server.state.mode = "ok";
    await sync();
    expect(engine.getState().conflicts).toBe(0);
    expect(server.live("transactions", TX1)).toMatchObject({ merchant: "Кофейня у дома", note: "с коллегой" });
    expect(await store.get("transactions", TX1)).toMatchObject({ merchant: "Кофейня у дома", note: "с коллегой" });
  });

  it("то же поле изменили на другом устройстве — конфликт: «оставить мою» отправляет правку", async () => {
    const { server, store, engine, sync } = await setup();
    server.put("transactions", { id: TX1, accountId: ACCOUNT, type: "expense", amount: "-10.00", date: "2026-10-01", merchant: "Кофе" });
    await sync();
    server.state.mode = "offline";
    await updateTransaction(store, TX1, { merchant: "Моё" });
    server.put("transactions", { ...server.live("transactions", TX1)!, merchant: "Чужое" });
    server.state.mode = "ok";
    await sync();
    expect(server.log).toEqual([]); // ничего не отправлено
    expect(engine.getState()).toMatchObject({ conflicts: 1, pending: 0 });
    const [issue] = await store.issues();
    expect(issue.conflict).toEqual({ fields: ["merchant"], server: { merchant: "Чужое" }, reason: "changed" });
    expect(await store.get("transactions", TX1)).toMatchObject({ merchant: "Моё" }); // до решения видна своя правка

    await store.keepMine(issue.seq);
    await sync();
    expect(server.live("transactions", TX1)).toMatchObject({ merchant: "Моё" });
    expect(engine.getState().conflicts).toBe(0);
  });

  it("конфликт: «взять с сервера» отбрасывает правку", async () => {
    const { server, store, sync } = await setup();
    server.put("transactions", { id: TX1, accountId: ACCOUNT, type: "expense", amount: "-10.00", date: "2026-10-01", merchant: "Кофе" });
    await sync();
    server.state.mode = "offline";
    await updateTransaction(store, TX1, { merchant: "Моё" });
    server.put("transactions", { ...server.live("transactions", TX1)!, merchant: "Чужое" });
    server.state.mode = "ok";
    await sync();
    const [issue] = await store.issues();
    await store.takeServer(issue.seq);
    await sync();
    expect(await store.get("transactions", TX1)).toMatchObject({ merchant: "Чужое" });
    expect(server.log).toEqual([]);
  });

  it("id при создании занят другой версией (409 DUPLICATE_RESOURCE) — конфликт; «оставить мою» превращает создание в правку", async () => {
    const { server, store, sync } = await setup();
    await sync();
    server.state.mode = "lost";
    await createTransaction(store, TX1, expense());
    await sync(); // дошло, ответ потерян
    server.state.mode = "ok";
    server.put("transactions", { ...server.live("transactions", TX1)!, amount: "-999.00" }); // изменили на сайте
    server.state.mode = "offline";
    // курсор ещё не видел запись: снова отправим создание
    server.state.mode = "ok";
    const engine = new SyncEngine({ store, request: async <T>(path: string, init?: RequestOptions) => {
      if (path === "/api/v1/sync") return { changes: {}, deleted: {}, nextCursor: "0", hasMore: false } as T;
      return server.request<T>(path, init);
    } });
    await engine.sync();
    engine.stop();
    const [issue] = await store.issues();
    expect(issue).toMatchObject({ kind: "create", status: "conflict", conflict: { reason: "duplicate" } });

    await store.keepMine(issue.seq);
    await sync();
    expect(server.log[server.log.length - 1]).toBe(`PATCH /api/v1/transactions/${TX1}`);
    expect(server.live("transactions", TX1)).toMatchObject({ amount: "-150.00" });
  });

  it("запись удалили на сервере — неотправленная правка к ней отбрасывается", async () => {
    const { server, store, sync } = await setup();
    server.put("transactions", { id: TX1, accountId: ACCOUNT, amount: "-10.00", date: "2026-10-01" });
    await sync();
    server.state.mode = "offline";
    await updateTransaction(store, TX1, { merchant: "Моё" });
    server.put("transactions", server.live("transactions", TX1)!, true);
    server.state.mode = "ok";
    await sync();
    expect(await store.get("transactions", TX1)).toBeNull();
    expect(await store.outboxSummary()).toMatchObject({ pending: 0, conflicts: 0, failed: 0 });
    expect(server.log).toEqual([]);
  });
});

describe("хранилище", () => {
  it("wipe стирает записи, очередь и курсор", async () => {
    const { store, sync } = await setup();
    await sync();
    await createTransaction(store, TX1, expense());
    await store.wipe();
    expect(await store.count("accounts")).toBe(0);
    expect(await store.outboxSummary()).toMatchObject({ pending: 0, conflicts: 0, failed: 0 });
    expect(await store.getKv("sync.cursor")).toBeNull();
  });

  it("миграции повторно ничего не ломают, данные переживают переоткрытие", async () => {
    const db = nodeSqlite();
    const first = new LocalStore(db);
    await first.open();
    await createTransaction(first, TX1, expense());
    const second = new LocalStore(db);
    await second.open();
    expect(await second.get("transactions", TX1)).toMatchObject({ merchant: "Кофейня" });
  });

  it("UUID v7: версия 7, сортируется по времени", () => {
    const random = (size: number) => new Uint8Array(size).fill(0xff);
    const a = uuidv7(random, 1_700_000_000_000);
    const b = uuidv7(random, 1_700_000_000_001);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(a < b).toBe(true);
    expect(a.slice(0, 13).replace("-", "")).toBe((1_700_000_000_000).toString(16).padStart(12, "0"));
  });
});

describe("данные и сессия", () => {
  it("явный выход стирает всё; истёкшая сессия сохраняет неотправленное для того же пользователя", async () => {
    const { store, engine, sync } = await setup();
    await handleSessionEvent(store, engine, { type: "signedIn", userId: "u1" });
    await sync();
    await createTransaction(store, TX1, expense());

    await handleSessionEvent(store, engine, { type: "signedOut", reason: "expired" });
    await handleSessionEvent(store, engine, { type: "signedIn", userId: "u1" });
    expect(await store.get("transactions", TX1)).not.toBeNull();
    expect((await store.outboxSummary()).pending).toBe(1);

    await handleSessionEvent(store, engine, { type: "signedOut", reason: "logout" });
    expect(await store.count("accounts")).toBe(0);
    expect((await store.outboxSummary()).pending).toBe(0);
  });

  it("вошёл другой пользователь — данные прежнего стираются", async () => {
    const { store, engine, sync } = await setup();
    await handleSessionEvent(store, engine, { type: "signedIn", userId: "u1" });
    await sync();
    await handleSessionEvent(store, engine, { type: "signedOut", reason: "expired" });
    await handleSessionEvent(store, engine, { type: "signedIn", userId: "u2" });
    expect(await store.count("accounts")).toBe(0);
    expect(await store.getKv("owner")).toBe("u2");
  });

  it("плашка: нет сети с очередью, ошибки и конфликты, повтор после ошибки сервера", () => {
    const base: SyncState = { phase: "idle", lastSyncAt: 1, pending: 0, retrying: 0, conflicts: 0, failed: 0, error: null };
    expect(describeSync(base)).toBeNull();
    expect(describeSync({ ...base, pending: 2 })).toBeNull(); // правка только что сделана и сейчас уйдёт
    expect(describeSync({ ...base, phase: "offline", pending: 3 })?.text).toBe("Нет сети · изменения отправятся позже · 3 в очереди");
    expect(describeSync({ ...base, phase: "offline" })?.text).toBe("Нет сети · показаны сохранённые данные");
    expect(describeSync({ ...base, pending: 1, retrying: 1 })?.text).toBe("Сервер недоступен · изменения отправятся позже · 1 в очереди");
    expect(describeSync({ ...base, conflicts: 1, failed: 2 })).toEqual({
      text: "Нужно ваше решение — изменено на другом устройстве: 1, не удалось сохранить: 2", tone: "danger", actionable: true,
    });
  });
});
