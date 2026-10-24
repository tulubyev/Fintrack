import { migrate, type SqlDb } from "./db";

/**
 * Локальное хранилище приложения (E2.1-T5) без привязки к React Native — покрыто тестами на настоящем SQLite.
 *
 * Экран читает записи отсюда (мгновенно, без сети) и пишет через mutate: правка сразу видна и встаёт в очередь outbox.
 * Видимая версия записи — серверная плюс поля ещё не отправленных правок; после ответа сервера или по команде
 * «взять с сервера» она пересобирается из этих двух частей.
 *
 * Конфликт — правка ждёт отправки, а синхронизация принесла серверную версию, где те же поля изменили иначе
 * (на другом устройстве). Правки разных полей сливаются сами. Конфликт ждёт решения: «оставить мою» отправит правку,
 * «взять с сервера» её отбросит.
 */

/** Как в GET /api/v1/sync. */
export const ENTITIES = ["accounts", "categories", "transactions", "budgets", "goals", "goalContributions", "recurring", "rules"] as const;
export type Entity = (typeof ENTITIES)[number];

type Fields = Record<string, unknown>;

export interface Mutation {
  entity: Entity;
  id: string;
  kind: "create" | "update" | "delete";
  method: "POST" | "PATCH" | "PUT" | "DELETE";
  path: string;
  body?: Fields;
  /** Поля для локального вида: при создании — вся запись, при правке — изменённые поля. */
  patch?: Fields;
  /** false — правку нельзя слить с предыдущей (у неё побочный эффект, например «применить к похожим»). */
  mergeable?: boolean;
}

export type OutboxStatus = "pending" | "conflict" | "failed";

export interface Conflict {
  /** Поля, которые изменили и здесь, и на сервере. */
  fields: string[];
  /** Значения этих полей на сервере; reason=duplicate — при создании оказалось, что id уже занят. */
  server: Fields;
  reason: "changed" | "duplicate";
}

export interface OutboxItem {
  seq: number;
  entity: Entity;
  entityId: string;
  kind: Mutation["kind"];
  method: Mutation["method"];
  path: string;
  body: Fields | null;
  patch: Fields | null;
  status: OutboxStatus;
  attempts: number;
  error: string | null;
  conflict: Conflict | null;
}

export interface SyncPageData {
  changes: Partial<Record<Entity, Fields[]>>;
  deleted: Partial<Record<Entity, string[]>>;
  nextCursor: string;
}

export interface ListOptions {
  accountId?: string;
  categoryId?: string;
  limit?: number;
  offset?: number;
}

/** Что изменилось: local — правка на устройстве (пора отправлять), remote — пришло с сервера, outbox — очередь. */
export type ChangeKind = "local" | "remote" | "outbox";

interface RecordRow {
  data: string;
  server: string | null;
}

interface OutboxRow {
  seq: number;
  entity: Entity;
  entity_id: string;
  kind: Mutation["kind"];
  method: Mutation["method"];
  path: string;
  body: string | null;
  patch: string | null;
  mergeable: number;
  status: OutboxStatus;
  attempts: number;
  next_at: number;
  error: string | null;
  conflict: string | null;
}

const parse = <T>(value: string | null): T | null => (value === null ? null : (JSON.parse(value) as T));
const json = (value: unknown) => (value === undefined || value === null ? null : JSON.stringify(value));
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const str = (value: unknown) => (typeof value === "string" ? value : null);

const toItem = (row: OutboxRow): OutboxItem => ({
  seq: row.seq,
  entity: row.entity,
  entityId: row.entity_id,
  kind: row.kind,
  method: row.method,
  path: row.path,
  body: parse(row.body),
  patch: parse(row.patch),
  status: row.status,
  attempts: row.attempts,
  error: row.error,
  conflict: parse(row.conflict),
});

/** Пауза перед повтором после сбоя сети или 5xx: 5 с, 10 с, 20 с… не больше 15 минут. */
export const retryDelay = (attempts: number) => Math.min(5_000 * 2 ** Math.max(0, attempts - 1), 15 * 60_000);

export class LocalStore {
  private listeners = new Set<(kind: ChangeKind) => void>();
  /** Отправляемые сейчас записи очереди: их не сливаем с новыми правками и не трогаем при синхронизации. */
  private inFlight = new Set<number>();
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly db: SqlDb, private readonly now: () => number = Date.now) {}

  private opened: Promise<void> | null = null;

  /** Схема базы; любая операция хранилища сначала дожидается её. */
  open(): Promise<void> {
    return (this.opened ??= migrate(this.db).catch((error) => {
      this.opened = null;
      throw error;
    }));
  }

  private async conn(): Promise<SqlDb> {
    await this.open();
    return this.db;
  }

  subscribe(listener: (kind: ChangeKind) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(kind: ChangeKind): void {
    this.listeners.forEach((listener) => listener(kind));
  }

  /** Записи меняются строго по одной операции за раз: правка экрана не перемешается с применением страницы синхронизации. */
  private exclusive<T>(fn: (tx: SqlDb) => Promise<T>): Promise<T> {
    const run = this.queue.then(async () => (await this.conn()).transaction(fn));
    this.queue = run.catch(() => undefined);
    return run;
  }

  // ---------------------------------------------------------------- чтение

  async get<T = Fields>(entity: Entity, id: string): Promise<T | null> {
    const row = await (await this.conn()).first<{ data: string }>("SELECT data FROM records WHERE entity = ? AND id = ? AND hidden = 0", [entity, id]);
    return row ? (JSON.parse(row.data) as T) : null;
  }

  /** Записи сущности, новые даты — первыми. */
  async list<T = Fields>(entity: Entity, options: ListOptions = {}): Promise<T[]> {
    const where = ["entity = ?", "hidden = 0"];
    const params: (string | number)[] = [entity];
    if (options.accountId) {
      where.push("account_id = ?");
      params.push(options.accountId);
    }
    if (options.categoryId) {
      where.push("category_id = ?");
      params.push(options.categoryId);
    }
    params.push(options.limit ?? -1, options.offset ?? 0);
    const rows = await (await this.conn()).all<{ data: string }>(
      `SELECT data FROM records WHERE ${where.join(" AND ")} ORDER BY date DESC, id DESC LIMIT ? OFFSET ?`,
      params,
    );
    return rows.map((row) => JSON.parse(row.data) as T);
  }

  async count(entity: Entity): Promise<number> {
    const row = await (await this.conn()).first<{ n: number }>("SELECT count(*) AS n FROM records WHERE entity = ? AND hidden = 0", [entity]);
    return row?.n ?? 0;
  }

  async getKv(key: string): Promise<string | null> {
    return (await (await this.conn()).first<{ value: string }>("SELECT value FROM kv WHERE key = ?", [key]))?.value ?? null;
  }

  setKv(key: string, value: string | null): Promise<void> {
    return this.exclusive((tx) => writeKv(tx, key, value));
  }

  /** Сколько правок ждёт отправки (из них retrying — после ошибки сервера), сколько конфликтов и ошибок ждут решения. */
  async outboxSummary(): Promise<{ pending: number; conflicts: number; failed: number; retrying: number }> {
    const rows = await (await this.conn()).all<{ status: OutboxStatus; n: number; retrying: number }>(
      "SELECT status, count(*) AS n, sum(attempts > 0) AS retrying FROM outbox GROUP BY status",
    );
    const row = (status: OutboxStatus) => rows.find((item) => item.status === status);
    return { pending: row("pending")?.n ?? 0, conflicts: row("conflict")?.n ?? 0, failed: row("failed")?.n ?? 0, retrying: row("pending")?.retrying ?? 0 };
  }

  /** Когда истечёт ближайшая пауза перед повтором отправки, мс; null — никто не ждёт. */
  async nextRetryAt(): Promise<number | null> {
    const row = await (await this.conn()).first<{ at: number | null }>("SELECT min(next_at) AS at FROM outbox WHERE status = 'pending' AND next_at > ?", [this.now()]);
    return row?.at ?? null;
  }

  resetBackoff(): Promise<void> {
    return this.exclusive((tx) => tx.run("UPDATE outbox SET next_at = 0 WHERE status = 'pending'"));
  }

  /** Конфликты и ошибки — для экрана «не удалось отправить». */
  async issues(): Promise<OutboxItem[]> {
    const rows = await (await this.conn()).all<OutboxRow>("SELECT * FROM outbox WHERE status <> 'pending' ORDER BY seq");
    return rows.map(toItem);
  }

  // ---------------------------------------------------------------- правки на устройстве

  /** Правка экрана: сразу видна локально и встаёт в очередь на отправку. */
  async mutate(mutation: Mutation): Promise<void> {
    await this.exclusive(async (tx) => {
      const { entity, id } = mutation;
      const waiting = (await this.entityOps(tx, entity, id)).filter((op) => op.status === "pending" && !this.inFlight.has(op.seq));
      const last = waiting[waiting.length - 1];

      if (mutation.kind === "update" && mutation.mergeable !== false && last && last.kind !== "delete" && last.mergeable) {
        // Правка ещё не ушла — дописываем в неё: на сервер уйдёт один запрос с итоговыми полями
        await tx.run("UPDATE outbox SET body = ?, patch = ? WHERE seq = ?", [
          json({ ...parse<Fields>(last.body), ...mutation.body }),
          json({ ...parse<Fields>(last.patch), ...mutation.patch }),
          last.seq,
        ]);
      } else if (mutation.kind === "delete" && waiting.some((op) => op.kind === "create")) {
        // Запись не успела дойти до сервера — удалять там нечего
        await tx.run(`DELETE FROM outbox WHERE seq IN (${waiting.map((op) => op.seq).join(",")})`);
      } else {
        if (mutation.kind === "delete" && waiting.length) {
          await tx.run(`DELETE FROM outbox WHERE seq IN (${waiting.map((op) => op.seq).join(",")})`);
        }
        if (mutation.kind === "create") {
          await tx.run("INSERT OR IGNORE INTO records (entity, id, data) VALUES (?, ?, '{}')", [entity, id]);
        }
        await tx.run(
          `INSERT INTO outbox (entity, entity_id, kind, method, path, body, patch, mergeable, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [entity, id, mutation.kind, mutation.method, mutation.path, json(mutation.body), json(mutation.patch),
            mutation.mergeable === false ? 0 : 1, this.now()],
        );
      }
      await this.rebuild(tx, entity, id);
    });
    this.emit("local");
  }

  // ---------------------------------------------------------------- очередь для синхронизации

  /**
   * Следующая правка к отправке — строго по порядку: запись в новый счёт не уйдёт раньше самого счёта.
   * Конфликт или ошибка задерживают только правки той же записи. Null — отправлять нечего или рано (пауза после сбоя).
   */
  async takeNext(): Promise<OutboxItem | null> {
    return this.exclusive(async (tx) => {
      if (this.inFlight.size) return null;
      const rows = await tx.all<OutboxRow>("SELECT * FROM outbox ORDER BY seq");
      const blocked = new Set<string>();
      for (const row of rows) {
        const key = `${row.entity}:${row.entity_id}`;
        if (row.status !== "pending") {
          blocked.add(key);
          continue;
        }
        if (blocked.has(key)) continue;
        if (row.next_at > this.now()) return null;
        this.inFlight.add(row.seq);
        return toItem(row);
      }
      return null;
    });
  }

  /** Сервер принял правку. */
  async complete(item: OutboxItem): Promise<void> {
    await this.exclusive(async (tx) => {
      this.inFlight.delete(item.seq);
      const row = await tx.first<RecordRow>("SELECT data, server FROM records WHERE entity = ? AND id = ?", [item.entity, item.entityId]);
      await tx.run("DELETE FROM outbox WHERE seq = ?", [item.seq]);
      if (row && item.kind === "delete") {
        await tx.run("DELETE FROM records WHERE entity = ? AND id = ?", [item.entity, item.entityId]);
        await tx.run("DELETE FROM outbox WHERE entity = ? AND entity_id = ?", [item.entity, item.entityId]);
      } else if (row) {
        // Пока синхронизация не принесла ответ сервера, его версией считаем отправленное
        const server = { ...parse<Fields>(row.server), ...item.patch };
        await tx.run("UPDATE records SET server = ? WHERE entity = ? AND id = ?", [JSON.stringify(server), item.entity, item.entityId]);
        await this.rebuild(tx, item.entity, item.entityId);
      }
    });
    this.emit("outbox");
  }

  /** Сбой сети или сервера: повторим позже. */
  async defer(item: OutboxItem, error: string): Promise<void> {
    await this.exclusive(async (tx) => {
      this.inFlight.delete(item.seq);
      const attempts = item.attempts + 1;
      await tx.run("UPDATE outbox SET attempts = ?, next_at = ?, error = ? WHERE seq = ?", [attempts, this.now() + retryDelay(attempts), error, item.seq]);
    });
    this.emit("outbox");
  }

  /** Отправка прервалась без ответа (приложение ушло в фон, запрос отменён): вернуть в очередь как было. */
  release(item: OutboxItem): void {
    this.inFlight.delete(item.seq);
  }

  /** Сервер отклонил правку (4xx): локальный вид возвращается к серверному, ошибка ждёт пользователя. */
  async fail(item: OutboxItem, error: string): Promise<void> {
    await this.exclusive(async (tx) => {
      this.inFlight.delete(item.seq);
      await tx.run("UPDATE outbox SET status = 'failed', error = ? WHERE seq = ?", [error, item.seq]);
      await this.rebuild(tx, item.entity, item.entityId);
    });
    this.emit("outbox");
  }

  /** Создание наткнулось на занятый id (409 DUPLICATE_RESOURCE): запись уже есть на сервере и отличается. */
  async markDuplicate(item: OutboxItem): Promise<void> {
    await this.exclusive(async (tx) => {
      this.inFlight.delete(item.seq);
      const conflict: Conflict = { fields: [], server: {}, reason: "duplicate" };
      await tx.run("UPDATE outbox SET status = 'conflict', conflict = ? WHERE seq = ?", [JSON.stringify(conflict), item.seq]);
    });
    this.emit("outbox");
  }

  /** «Оставить мою»: конфликт — отправить правку поверх серверной версии; ошибка — попробовать ещё раз. */
  async keepMine(seq: number): Promise<void> {
    await this.exclusive(async (tx) => {
      const row = await tx.first<OutboxRow>("SELECT * FROM outbox WHERE seq = ?", [seq]);
      if (!row || row.status === "pending") return;
      const duplicate = parse<Conflict>(row.conflict)?.reason === "duplicate";
      if (duplicate) {
        // id занят этой же записью, изменённой на другом устройстве: создание превращается в правку
        const { id: _id, ...body } = parse<Fields>(row.body) ?? {};
        await tx.run(
          "UPDATE outbox SET kind = 'update', method = 'PATCH', path = ?, body = ?, status = 'pending', conflict = NULL, error = NULL, attempts = 0, next_at = 0 WHERE seq = ?",
          [`${row.path}/${row.entity_id}`, JSON.stringify(body), seq],
        );
      } else {
        await tx.run("UPDATE outbox SET status = 'pending', conflict = NULL, error = NULL, attempts = 0, next_at = 0 WHERE seq = ?", [seq]);
      }
      await this.rebuild(tx, row.entity, row.entity_id);
    });
    this.emit("local");
  }

  /** «Взять с сервера»: правка отбрасывается, запись — как на сервере. */
  async takeServer(seq: number): Promise<void> {
    await this.exclusive(async (tx) => {
      const row = await tx.first<OutboxRow>("SELECT entity, entity_id, status FROM outbox WHERE seq = ?", [seq]);
      if (!row || this.inFlight.has(seq)) return;
      await tx.run("DELETE FROM outbox WHERE seq = ?", [seq]);
      await this.rebuild(tx, row.entity, row.entity_id);
    });
    this.emit("outbox");
  }

  // ---------------------------------------------------------------- данные с сервера

  /** Страница GET /api/v1/sync и её курсор — одной транзакцией: оборвётся — страница придёт заново. */
  async applyPage(page: SyncPageData): Promise<void> {
    await this.exclusive(async (tx) => {
      for (const entity of ENTITIES) {
        for (const record of page.changes[entity] ?? []) await this.applyRemote(tx, entity, record);
        for (const id of page.deleted[entity] ?? []) {
          // Удаление на сервере сильнее неотправленных правок: записи больше нет
          await tx.run("DELETE FROM records WHERE entity = ? AND id = ?", [entity, id]);
          await tx.run(
            `DELETE FROM outbox WHERE entity = ? AND entity_id = ?${this.inFlight.size ? ` AND seq NOT IN (${[...this.inFlight].join(",")})` : ""}`,
            [entity, id],
          );
        }
      }
      await writeKv(tx, "sync.cursor", page.nextCursor);
    });
    this.emit("remote");
  }

  /** Курсор устарел (410): серверные записи без неотправленных правок стираются, полный снимок придёт заново. */
  async resetForResync(): Promise<void> {
    await this.exclusive(async (tx) => {
      await tx.run("DELETE FROM records WHERE NOT EXISTS (SELECT 1 FROM outbox WHERE outbox.entity = records.entity AND outbox.entity_id = records.id)");
      await writeKv(tx, "sync.cursor", null);
    });
    this.emit("remote");
  }

  /** Стереть всё: выход, смена пользователя. */
  async wipe(): Promise<void> {
    await this.exclusive(async (tx) => {
      this.inFlight.clear();
      await tx.exec("DELETE FROM records; DELETE FROM outbox; DELETE FROM kv;");
    });
    this.emit("remote");
  }

  private async applyRemote(tx: SqlDb, entity: Entity, record: Fields): Promise<void> {
    const id = String(record.id);
    const ops = (await this.entityOps(tx, entity, id)).filter((op) => op.status !== "failed");
    if (!ops.length) {
      await this.writeRecord(tx, entity, id, record, record, false);
      return;
    }
    const row = await tx.first<RecordRow>("SELECT data, server FROM records WHERE entity = ? AND id = ?", [entity, id]);
    const previous = parse<Fields>(row?.server ?? null);
    for (const op of ops) {
      if (op.kind !== "update" || op.status !== "pending" || this.inFlight.has(op.seq) || !previous) continue;
      const patch = parse<Fields>(op.patch) ?? {};
      const fields = Object.keys(patch).filter((key) => !same(previous[key], record[key]) && !same(record[key], patch[key]));
      if (fields.length) {
        const conflict: Conflict = { fields, server: Object.fromEntries(fields.map((key) => [key, record[key] ?? null])), reason: "changed" };
        await tx.run("UPDATE outbox SET status = 'conflict', conflict = ? WHERE seq = ?", [JSON.stringify(conflict), op.seq]);
      }
    }
    await tx.run("INSERT OR IGNORE INTO records (entity, id, data) VALUES (?, ?, '{}')", [entity, id]);
    await tx.run("UPDATE records SET server = ? WHERE entity = ? AND id = ?", [JSON.stringify(record), entity, id]);
    await this.rebuild(tx, entity, id);
  }

  private entityOps(tx: SqlDb, entity: Entity, id: string): Promise<OutboxRow[]> {
    return tx.all<OutboxRow>("SELECT * FROM outbox WHERE entity = ? AND entity_id = ? ORDER BY seq", [entity, id]);
  }

  /** Видимая версия = серверная + поля неотправленных правок (и правок в конфликте) по порядку. */
  private async rebuild(tx: SqlDb, entity: Entity, id: string): Promise<void> {
    const row = await tx.first<RecordRow>("SELECT data, server FROM records WHERE entity = ? AND id = ?", [entity, id]);
    if (!row) return;
    const server = parse<Fields>(row.server);
    let data: Fields | null = server;
    let hidden = false;
    for (const op of await this.entityOps(tx, entity, id)) {
      if (op.status === "failed") continue;
      if (op.kind === "delete") hidden = true;
      else data = { ...data, ...parse<Fields>(op.patch) };
    }
    if (!data) {
      await tx.run("DELETE FROM records WHERE entity = ? AND id = ?", [entity, id]);
      return;
    }
    await this.writeRecord(tx, entity, id, data, server, hidden);
  }

  private writeRecord(tx: SqlDb, entity: Entity, id: string, data: Fields, server: Fields | null, hidden: boolean): Promise<void> {
    return tx.run(
      `INSERT INTO records (entity, id, data, server, account_id, category_id, date, hidden) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (entity, id) DO UPDATE SET data = excluded.data, server = excluded.server, account_id = excluded.account_id,
         category_id = excluded.category_id, date = excluded.date, hidden = excluded.hidden`,
      [entity, id, JSON.stringify(data), json(server), str(data.accountId), str(data.categoryId), str(data.date), hidden ? 1 : 0],
    );
  }
}

function writeKv(tx: SqlDb, key: string, value: string | null): Promise<void> {
  return value === null
    ? tx.run("DELETE FROM kv WHERE key = ?", [key])
    : tx.run("INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value", [key, value]);
}
