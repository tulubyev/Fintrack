/**
 * Ставит фоновую задачу в очередь вручную (docs/DEPLOY.md, «Фоновые задачи»):
 *   docker exec fintrack-api node dist/scripts/enqueue-job.mjs fx.rates.backfill '{"days":1095}'
 * Выполнит её контейнер fintrack-worker.
 */
import { pool } from "@workspace/db";
import { enqueue, startJobs, stopJobs } from "../jobs";
import { jobDefinitions } from "../jobs/definitions";

async function main() {
  const [name, rawData = "{}"] = process.argv.slice(2);
  const known = jobDefinitions.map((job) => job.name);
  if (!name || !known.includes(name)) throw new Error(`Укажите задачу: ${known.join(" | ")}`);
  await startJobs("off");
  const id = await enqueue(name, JSON.parse(rawData));
  console.log(id ? `Задача ${name} поставлена: ${id}` : `Задача ${name} уже в очереди`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await stopJobs(2_000);
    await pool.end();
  });
