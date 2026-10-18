import { defineConfig } from "drizzle-kit";
import path from "path";

// generate и check работают без базы; migrate/studio берут DATABASE_URL
export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  out: "./migrations", // относительно lib/db: абсолютный путь drizzle-kit 0.31 портит
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://localhost/unused",
  },
  migrations: {
    table: "__drizzle_migrations",
    schema: "drizzle",
  },
});
