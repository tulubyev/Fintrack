import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Системный PostgreSQL на VPS (172.28.0.1:5432) работает без SSL.
// DATABASE_SSL=true включает SSL для управляемых баз.
const useSsl = ["true", "1", "yes"].includes(
  (process.env.DATABASE_SSL ?? "").toLowerCase(),
);

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.DATABASE_MAX_CONNECTIONS ?? 10),
  ssl: useSsl ? { rejectUnauthorized: false } : false,
});
export const db = drizzle(pool, { schema });

export * from "./schema";
