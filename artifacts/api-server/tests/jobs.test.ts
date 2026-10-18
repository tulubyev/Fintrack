/**
 * Фоновые задачи (E1.0-T2): задача выполняется быстро, упавшая повторяется, задачи переживают перезапуск воркера.
 */
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { db, authSessions } from "@workspace/db";
import { inArray } from "drizzle-orm";
import { enqueue, jobsBoss, startJobs, stopJobs } from "../src/jobs";
import type { JobDefinition } from "../src/jobs/definitions";
import { jobDefinitions } from "../src/jobs/definitions";
import { registerUser } from "./helpers";

afterEach(async () => {
  await stopJobs(2_000);
});

// Ждём условие с опросом: задачи выполняются в фоне
async function waitFor(check: () => boolean | Promise<boolean>, timeoutMs: number): Promise<number> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await check()) return Date.now() - started;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Условие не выполнилось за ${timeoutMs} мс`);
}

const queue = (prefix: string) => `test.${prefix}.${randomUUID().slice(0, 8)}`;

describe("фоновые задачи", () => {
  it("задача из очереди выполняется не позже чем через 5 с", async () => {
    const received: object[] = [];
    const name = queue("echo");
    await startJobs("both", [{ name, handler: async (data) => { received.push(data); } }]);

    await enqueue(name, { hello: "мир" });
    const elapsed = await waitFor(() => received.length === 1, 5_000);

    expect(received[0]).toEqual({ hello: "мир" });
    expect(elapsed).toBeLessThan(5_000);
  });

  it("упавшая задача повторяется и в итоге выполняется", async () => {
    let attempts = 0;
    const name = queue("flaky");
    const flaky: JobDefinition = {
      name,
      options: { retryLimit: 3, retryDelay: 1, retryBackoff: true },
      handler: async () => {
        attempts++;
        if (attempts < 3) throw new Error(`сбой ${attempts}`);
      },
    };
    await startJobs("both", [flaky]);

    const id = await enqueue(name);
    await waitFor(async () => (await jobsBoss()!.getJobById(name, id!))?.state === "completed", 15_000);
    expect(attempts).toBe(3);
  });

  it("после исчерпания повторов задача помечается упавшей", async () => {
    let attempts = 0;
    const name = queue("broken");
    await startJobs("both", [{
      name,
      options: { retryLimit: 1, retryDelay: 1 },
      handler: async () => { attempts++; throw new Error("всегда падает"); },
    }]);

    const id = await enqueue(name);
    await waitFor(async () => (await jobsBoss()!.getJobById(name, id!))?.state === "failed", 10_000);
    expect(attempts).toBe(2); // первая попытка и один повтор
  });

  it("задача, поставленная без воркера, выполняется после его запуска", async () => {
    const received: object[] = [];
    const name = queue("persist");
    const definition: JobDefinition = { name, handler: async (data) => { received.push(data); } };

    await startJobs("off", [definition]); // API: только ставит задачи
    await enqueue(name, { n: 1 });
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    expect(received).toHaveLength(0);
    await stopJobs();

    await startJobs("only", [definition]); // воркер стартует позже
    await waitFor(() => received.length === 1, 5_000);
    expect(received[0]).toEqual({ n: 1 });
  });

  it("enqueue без запущенной очереди — понятная ошибка", async () => {
    await expect(enqueue("cleanup.sessions")).rejects.toThrow("Очередь фоновых задач недоступна");
  });
});

describe("cleanup.sessions", () => {
  it("удаляет сессии, истёкшие или отозванные больше 30 дней назад, и не трогает остальные", async () => {
    const user = await registerUser();
    const day = 24 * 60 * 60 * 1000;
    const now = Date.now();
    const rows = await db.insert(authSessions).values([
      { userId: user.id, refreshTokenHash: randomUUID().replace(/-/g, ""), expiresAt: new Date(now - 31 * day) },
      { userId: user.id, refreshTokenHash: randomUUID().replace(/-/g, ""), expiresAt: new Date(now + day), revokedAt: new Date(now - 31 * day) },
      { userId: user.id, refreshTokenHash: randomUUID().replace(/-/g, ""), expiresAt: new Date(now - 5 * day) },
      { userId: user.id, refreshTokenHash: randomUUID().replace(/-/g, ""), expiresAt: new Date(now + day), revokedAt: new Date(now - 5 * day) },
    ]).returning({ id: authSessions.id });

    await jobDefinitions.find((job) => job.name === "cleanup.sessions")!.handler({});

    const left = await db.select({ id: authSessions.id }).from(authSessions)
      .where(inArray(authSessions.id, [...rows.map((r) => r.id), user.sessionId]));
    expect(left.map((r) => r.id).sort()).toEqual([rows[2].id, rows[3].id, user.sessionId].sort());
  });

  it("воркер ставит её в расписание на 04:00 по Москве", async () => {
    await startJobs("only");
    const [schedule] = await jobsBoss()!.getSchedules("cleanup.sessions");
    expect(schedule).toMatchObject({ cron: "0 4 * * *", timezone: "Europe/Moscow" });
  });
});
