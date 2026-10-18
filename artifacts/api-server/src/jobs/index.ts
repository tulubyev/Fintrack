/**
 * Фоновые задачи на pg-boss (решение D9): очередь в той же PostgreSQL, схема `pgboss`.
 *
 * WORKER_MODE задаёт роль процесса:
 *   off  — API: только ставит задачи (enqueue), сам не выполняет;
 *   only — воркер (контейнер fintrack-worker): выполняет задачи и cron, HTTP не поднимает;
 *   both — разработка: всё в одном процессе.
 *
 * На проде схема `pgboss` принадлежит прикладной роли (её создаёт db-migrate.sh), остальная база — только DML.
 */
import { PgBoss, type QueueOptions, type SendOptions } from "pg-boss";
import { pool } from "../db";
import { logger } from "../services/logger";
import { jobDefinitions, type JobDefinition } from "./definitions";

export type WorkerMode = "off" | "only" | "both";

const SCHEMA = "pgboss";
const TIMEZONE = "Europe/Moscow";

// Упавшая задача повторяется 3 раза с паузой 2, 4, 8 с (с разбросом); дольше 15 минут задача не живёт
const QUEUE_DEFAULTS: QueueOptions = {
  retryLimit: 3,
  retryDelay: 2,
  retryBackoff: true,
  expireInSeconds: 15 * 60,
};

let boss: PgBoss | null = null;

export function workerMode(): WorkerMode {
  const mode = process.env.WORKER_MODE ?? "both";
  if (mode !== "off" && mode !== "only" && mode !== "both") {
    throw new Error(`WORKER_MODE=${mode}: допустимо off | only | both`);
  }
  return mode;
}

// Без права CREATE на базу pg-boss не может выполнить CREATE SCHEMA IF NOT EXISTS даже для готовой схемы
async function schemaExists(): Promise<boolean> {
  const { rows } = await pool.query("SELECT 1 FROM pg_namespace WHERE nspname = $1", [SCHEMA]);
  return rows.length > 0;
}

export async function startJobs(mode: WorkerMode, definitions: JobDefinition<any>[] = jobDefinitions): Promise<void> {
  if (boss) throw new Error("Фоновые задачи уже запущены");
  const runsJobs = mode !== "off";
  const instance = new PgBoss({
    connectionString: process.env.DATABASE_URL,
    ssl: ["true", "1", "yes"].includes((process.env.DATABASE_SSL ?? "").toLowerCase()) ? { rejectUnauthorized: false } : false,
    schema: SCHEMA,
    createSchema: !(await schemaExists()),
    max: runsJobs ? 4 : 2,
    supervise: runsJobs, // обслуживание очередей и cron — только там, где выполняются задачи
    schedule: runsJobs,
  });
  instance.on("error", (error) => logger.error("pg-boss:", error));
  await instance.start();
  boss = instance;

  for (const definition of definitions) {
    await instance.createQueue(definition.name, { ...QUEUE_DEFAULTS, ...definition.options });
    if (!runsJobs) continue;

    await instance.work<object>(definition.name, { pollingIntervalSeconds: 1 }, async ([job]) => {
      try {
        await definition.handler(job.data ?? {});
      } catch (error) {
        logger.warn(`Задача ${definition.name} ${job.id} упала, pg-boss повторит её по настройкам очереди:`, error);
        throw error;
      }
    });
    if (definition.cron) {
      await instance.schedule(definition.name, definition.cron, null, { tz: TIMEZONE });
    }
  }
  logger.info(`Фоновые задачи: режим ${mode}, очередей ${definitions.length}`);
}

/** Ставит задачу в очередь. Возвращает id задачи или null, если её отсекла политика очереди. */
export async function enqueue(name: string, data: object = {}, options?: SendOptions): Promise<string | null> {
  if (!boss) throw new Error("Очередь фоновых задач недоступна");
  return boss.send(name, data, options);
}

/** Останавливает приём задач и ждёт текущие, но не дольше timeoutMs. */
export async function stopJobs(timeoutMs = 20_000): Promise<void> {
  const instance = boss;
  boss = null;
  await instance?.stop({ graceful: true, timeout: timeoutMs });
}

export function jobsBoss(): PgBoss | null {
  return boss;
}
