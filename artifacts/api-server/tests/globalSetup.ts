import path from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const migrationsFolder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../lib/db/migrations");

// Перед тестами схема тестовой базы доводится до последней миграции
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error("Задайте TEST_DATABASE_URL — отдельную базу для тестов: тесты пишут в неё пользователей и данные");
  }
  process.env.DATABASE_URL = url; // @workspace/db читает адрес при импорте
  const { pool } = await import("@workspace/db");
  try {
    await migrate(drizzle(pool), { migrationsFolder, migrationsTable: "__drizzle_migrations", migrationsSchema: "drizzle" });
  } finally {
    await pool.end();
  }
}
