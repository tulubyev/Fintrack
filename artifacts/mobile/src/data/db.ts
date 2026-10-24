/**
 * Локальная база приложения (E2.1-T5): SQLite через узкий интерфейс — на устройстве expo-sqlite,
 * в тестах node:sqlite. Схема версионируется через PRAGMA user_version.
 */

export type SqlValue = string | number | null;

export interface SqlDb {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: SqlValue[]): Promise<void>;
  all<T>(sql: string, params?: SqlValue[]): Promise<T[]>;
  first<T>(sql: string, params?: SqlValue[]): Promise<T | null>;
  /** Всё внутри — одна транзакция; запросы идут через переданный объект. */
  transaction<T>(fn: (tx: SqlDb) => Promise<T>): Promise<T>;
}

/**
 * records — зеркало сущностей сервера одной таблицей: data — то, что видит экран (сервер + локальные правки),
 * server — последняя версия с сервера (null — ещё не дошла). Колонки account_id, category_id, date — для выборок
 * ленты и фильтров без разбора JSON; hidden — удалено на устройстве, но удаление ещё не дошло до сервера.
 * outbox — очередь изменений: patch — поля для локального вида, body — тело запроса.
 */
const MIGRATIONS: string[] = [
  `
  CREATE TABLE records (
    entity TEXT NOT NULL,
    id TEXT NOT NULL,
    data TEXT NOT NULL,
    server TEXT,
    account_id TEXT,
    category_id TEXT,
    date TEXT,
    hidden INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (entity, id)
  );
  CREATE INDEX records_by_date ON records (entity, date DESC, id);
  CREATE INDEX records_by_account ON records (entity, account_id, date DESC);
  CREATE TABLE outbox (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    entity TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    method TEXT NOT NULL,
    path TEXT NOT NULL,
    body TEXT,
    patch TEXT,
    mergeable INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    next_at INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    conflict TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX outbox_by_entity ON outbox (entity, entity_id);
  CREATE TABLE kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `,
];

export const SCHEMA_VERSION = MIGRATIONS.length;

export async function migrate(db: SqlDb): Promise<void> {
  const row = await db.first<{ user_version: number }>("PRAGMA user_version");
  const current = row?.user_version ?? 0;
  for (let version = current; version < MIGRATIONS.length; version++) {
    await db.transaction(async (tx) => {
      await tx.exec(MIGRATIONS[version]);
      await tx.exec(`PRAGMA user_version = ${version + 1}`);
    });
  }
}
