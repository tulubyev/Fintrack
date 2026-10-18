/**
 * Миграции схемы на проде.
 *
 * Сервис подключается к БД как fintrack_user, который не владеет таблицами, поэтому
 * скрипт только читает журнал миграций и печатает SQL. Применяет его владелец
 * таблиц через psql — без пароля роли (см. docs/DEPLOY.md, «Миграции схемы»):
 *
 *   docker exec fintrack-api node dist/scripts/migrations-sql.mjs status
 *   docker exec fintrack-api node dist/scripts/migrations-sql.mjs pending \
 *     | sudo -u postgres psql -d fintrack_db -v ON_ERROR_STOP=1
 *
 * Однократно, чтобы пометить базовую миграцию применённой (таблицы уже есть):
 *   docker exec fintrack-api node dist/scripts/migrations-sql.mjs baseline \
 *     | sudo -u postgres psql -d fintrack_db -v ON_ERROR_STOP=1
 *
 * Журнал совместим с migrate() из drizzle-orm: те же схема, таблица, hash и created_at.
 */
import path from "path";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { pool } from "@workspace/db";

const OWNER_ROLE = process.env.MIGRATIONS_OWNER_ROLE || "tulubyev";
const APP_ROLE = process.env.MIGRATIONS_APP_ROLE || "fintrack_user";
const migrationsFolder = process.env.MIGRATIONS_DIR || path.resolve(process.cwd(), "migrations");

const quote = (value: string) => `'${value.replace(/'/g, "''")}'`;
const ident = (value: string) => `"${value.replace(/"/g, '""')}"`;

const migrations = readMigrationFiles({ migrationsFolder });

async function lastAppliedAt(): Promise<number | null> {
  const { rows: [exists] } = await pool.query(`SELECT to_regclass('drizzle.__drizzle_migrations') AS t`);
  if (!exists.t) return null;
  const { rows: [last] } = await pool.query(
    `SELECT created_at FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1`,
  );
  return last ? Number(last.created_at) : 0;
}

const journalInsert = (m: (typeof migrations)[number]) =>
  `INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES (${quote(m.hash)}, ${m.folderMillis});`;

async function main() {
  const command = process.argv[2] ?? "status";
  const applied = await lastAppliedAt();

  if (command === "status") {
    if (applied === null) {
      console.log("Журнала миграций нет: выполните однократно команду baseline (docs/DEPLOY.md).");
      return;
    }
    for (const m of migrations) {
      console.log(`${m.folderMillis <= applied ? "применена " : "ожидает   "} ${m.folderMillis} ${m.hash.slice(0, 12)}`);
    }
    return;
  }

  if (command === "baseline") {
    if (applied !== null) throw new Error("Журнал миграций уже есть — baseline не нужен");
    // Таблицы уже созданы раньше через drizzle-kit push: SQL базовой миграции не выполняется
    console.log([
      `SET ROLE ${ident(OWNER_ROLE)};`,
      "BEGIN;",
      "CREATE SCHEMA IF NOT EXISTS drizzle;",
      "CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint);",
      journalInsert(migrations[0]),
      `GRANT USAGE ON SCHEMA drizzle TO ${ident(APP_ROLE)};`,
      `GRANT SELECT ON drizzle.__drizzle_migrations TO ${ident(APP_ROLE)};`,
      "COMMIT;",
    ].join("\n"));
    return;
  }

  if (command === "pending") {
    if (applied === null) throw new Error("Журнала миграций нет: сначала baseline (docs/DEPLOY.md)");
    const pending = migrations.filter((m) => m.folderMillis > applied);
    if (pending.length === 0) {
      console.log("-- Ожидающих миграций нет");
      return;
    }
    // Все ожидающие миграции — одной транзакцией: либо все, либо ни одной
    const lines = [`SET ROLE ${ident(OWNER_ROLE)};`, "BEGIN;"];
    for (const m of pending) {
      lines.push(`-- миграция ${m.folderMillis}`, ...m.sql.map((s) => s.trim()).filter(Boolean), journalInsert(m));
    }
    lines.push("COMMIT;");
    console.log(lines.join("\n"));
    return;
  }

  throw new Error(`Неизвестная команда ${command}: status | pending | baseline`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
