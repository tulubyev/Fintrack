/**
 * In-app уведомления (E1.0-T4): создание с дедупликацией, список с курсором и счётчиком непрочитанных,
 * прочтение одного и всех, чистка старых прочитанных, права.
 */
import { describe, expect, it } from "vitest";
import request from "supertest";
import { and, eq, sql } from "drizzle-orm";
import { db, notifications } from "@workspace/db";
import { cleanupNotifications, notify } from "../src/services/notificationService";
import { jobDefinitions } from "../src/jobs/definitions";
import { app, auth, registerUser } from "./helpers";

describe("создание", () => {
  it("dedupKey не даёт создать повтор, без ключа — каждый раз новое", async () => {
    const user = await registerUser();
    const first = await notify(user.id, { type: "budget_threshold", title: "Бюджет «Продукты» — 80%", deepLink: "/budgets?month=2026-10", dedupKey: "budget:1:2026-10:80" });
    const again = await notify(user.id, { type: "budget_threshold", title: "Бюджет «Продукты» — 80%", dedupKey: "budget:1:2026-10:80" });
    expect(first?.id).toBeTruthy();
    expect(again).toBeNull();
    await notify(user.id, { type: "system", title: "Без ключа" });
    await notify(user.id, { type: "system", title: "Без ключа" });
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(notifications).where(eq(notifications.userId, user.id));
    expect(count).toBe(3);
  });

  it("deepLink — только путь своего сайта", async () => {
    const user = await registerUser();
    await expect(notify(user.id, { type: "system", title: "x", deepLink: "https://evil.example" })).rejects.toThrow();
    await expect(notify(user.id, { type: "system", title: "x", deepLink: "//evil.example" })).rejects.toThrow();
    // и база не пропустит в обход сервиса
    await expect(db.insert(notifications).values({ userId: user.id, type: "system", title: "x", deepLink: "//evil.example" })).rejects.toThrow();
  });

  it("неизвестный тип отклоняет база", async () => {
    const user = await registerUser();
    await expect(db.insert(notifications).values({ userId: user.id, type: "spam", title: "x" })).rejects.toThrow();
  });
});

describe("GET /api/v1/notifications", () => {
  it("новые сверху, курсор без пропусков и повторов, unreadCount", async () => {
    const user = await registerUser();
    for (let i = 0; i < 25; i++) await notify(user.id, { type: "system", title: `Уведомление ${i}` });

    const first = await request(app).get("/api/v1/notifications?limit=10").set(auth(user.token));
    expect(first.status).toBe(200);
    expect(first.body.items).toHaveLength(10);
    expect(first.body.items[0].title).toBe("Уведомление 24");
    expect(first.body.unreadCount).toBe(25);

    const seen = new Set<string>(first.body.items.map((item: { id: string }) => item.id));
    let cursor = first.body.nextCursor;
    while (cursor) {
      const page = await request(app).get(`/api/v1/notifications?limit=10&cursor=${cursor}`).set(auth(user.token));
      for (const item of page.body.items) {
        expect(seen.has(item.id)).toBe(false);
        seen.add(item.id);
      }
      cursor = page.body.nextCursor;
    }
    expect(seen.size).toBe(25);
  });

  it("unreadOnly, неверный курсор и лимит — 400", async () => {
    const user = await registerUser();
    const a = await notify(user.id, { type: "system", title: "Прочитанное" });
    await notify(user.id, { type: "system", title: "Новое" });
    await request(app).post(`/api/v1/notifications/${a!.id}/read`).set(auth(user.token)).expect(204);

    const unread = await request(app).get("/api/v1/notifications?unreadOnly=true").set(auth(user.token));
    expect(unread.body.items.map((item: { title: string }) => item.title)).toEqual(["Новое"]);
    expect(unread.body.unreadCount).toBe(1);

    expect((await request(app).get("/api/v1/notifications?cursor=abc").set(auth(user.token))).status).toBe(400);
    expect((await request(app).get("/api/v1/notifications?limit=500").set(auth(user.token))).status).toBe(400);
  });

  it("без токена — 401", async () => {
    expect((await request(app).get("/api/v1/notifications")).status).toBe(401);
  });
});

describe("прочтение", () => {
  it("одно — readAt и счётчик; повтор ничего не меняет; все сразу", async () => {
    const user = await registerUser();
    const one = await notify(user.id, { type: "import_done", title: "Импорт завершён", deepLink: "/transactions" });
    await notify(user.id, { type: "system", title: "Второе" });
    await notify(user.id, { type: "system", title: "Третье" });

    await request(app).post(`/api/v1/notifications/${one!.id}/read`).set(auth(user.token)).expect(204);
    const [row] = await db.select().from(notifications).where(eq(notifications.id, one!.id));
    expect(row.readAt).not.toBeNull();
    await request(app).post(`/api/v1/notifications/${one!.id}/read`).set(auth(user.token)).expect(204);
    const [again] = await db.select().from(notifications).where(eq(notifications.id, one!.id));
    expect(again.readAt?.toISOString()).toBe(row.readAt?.toISOString());

    let list = await request(app).get("/api/v1/notifications").set(auth(user.token));
    expect(list.body.unreadCount).toBe(2);
    await request(app).post("/api/v1/notifications/read-all").set(auth(user.token)).expect(204);
    list = await request(app).get("/api/v1/notifications").set(auth(user.token));
    expect(list.body.unreadCount).toBe(0);
  });

  it("несуществующее и некорректный id — 404", async () => {
    const user = await registerUser();
    expect((await request(app).post("/api/v1/notifications/00000000-0000-4000-8000-000000000000/read").set(auth(user.token))).status).toBe(404);
    expect((await request(app).post("/api/v1/notifications/abc/read").set(auth(user.token))).status).toBe(404);
  });
});

describe("права: B не видит и не читает уведомления A", () => {
  it("список B пуст, прочтение чужого — 404, read-all B не трогает A", async () => {
    const a = await registerUser();
    const b = await registerUser();
    const note = await notify(a.id, { type: "system", title: "Только для A" });

    const listB = await request(app).get("/api/v1/notifications").set(auth(b.token));
    expect(listB.body.items).toEqual([]);
    expect(listB.body.unreadCount).toBe(0);

    expect((await request(app).post(`/api/v1/notifications/${note!.id}/read`).set(auth(b.token))).status).toBe(404);
    await request(app).post("/api/v1/notifications/read-all").set(auth(b.token)).expect(204);

    const [row] = await db.select().from(notifications).where(eq(notifications.id, note!.id));
    expect(row.readAt).toBeNull();
  });
});

describe("чистка", () => {
  it("удаляет прочитанные старше 90 дней, непрочитанные и свежие оставляет; задача в расписании", async () => {
    const user = await registerUser();
    const old = await notify(user.id, { type: "system", title: "Старое прочитанное" });
    const oldUnread = await notify(user.id, { type: "system", title: "Старое непрочитанное" });
    const fresh = await notify(user.id, { type: "system", title: "Свежее прочитанное" });
    await db.update(notifications).set({ readAt: sql`now() - interval '91 days'` }).where(eq(notifications.id, old!.id));
    await db.update(notifications).set({ createdAt: sql`now() - interval '200 days'` }).where(eq(notifications.id, oldUnread!.id));
    await db.update(notifications).set({ readAt: sql`now() - interval '10 days'` }).where(eq(notifications.id, fresh!.id));

    expect(await cleanupNotifications()).toBeGreaterThanOrEqual(1);
    const left = await db.select({ id: notifications.id }).from(notifications).where(and(eq(notifications.userId, user.id)));
    expect(left.map((row) => row.id).sort()).toEqual([oldUnread!.id, fresh!.id].sort());
    expect(jobDefinitions.find((job) => job.name === "cleanup.notifications")?.cron).toBe("30 4 * * *");
  });
});
