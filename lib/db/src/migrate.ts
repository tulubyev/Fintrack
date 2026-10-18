/**
 * Применяет миграции из lib/db/migrations (локально и в CI).
 *
 *   DATABASE_URL=... pnpm --filter @workspace/db run migrate
 *
 * На проде миграции применяются под владельцем таблиц через psql — см. docs/DEPLOY.md.
 */
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

export const migrationsFolder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../migrations");
export const migrationsTable = { migrationsTable: "__drizzle_migrations", migrationsSchema: "drizzle" };

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL не задан");
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  await migrate(drizzle(pool), { migrationsFolder, ...migrationsTable });
  console.log("Миграции применены");
} finally {
  await pool.end();
}
