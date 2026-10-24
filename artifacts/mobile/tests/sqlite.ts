import { DatabaseSync } from "node:sqlite";
import type { SqlDb, SqlValue } from "../src/data/db";

/** SqlDb поверх node:sqlite — та же SQLite, что на устройстве, только без expo. */
export function nodeSqlite(path = ":memory:"): SqlDb & { raw: DatabaseSync } {
  const raw = new DatabaseSync(path);
  const db: SqlDb & { raw: DatabaseSync } = {
    raw,
    exec: async (sql) => raw.exec(sql),
    run: async (sql, params: SqlValue[] = []) => {
      raw.prepare(sql).run(...params);
    },
    all: async <T>(sql: string, params: SqlValue[] = []) => raw.prepare(sql).all(...params) as T[],
    first: async <T>(sql: string, params: SqlValue[] = []) => (raw.prepare(sql).get(...params) as T | undefined) ?? null,
    transaction: async (fn) => {
      raw.exec("BEGIN");
      try {
        const result = await fn(db);
        raw.exec("COMMIT");
        return result;
      } catch (error) {
        raw.exec("ROLLBACK");
        throw error;
      }
    },
  };
  return db;
}
