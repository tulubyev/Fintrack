/**
 * Отправка push (E2.2-T2): по настройке группы, тихие часы, объединение однотипных, лимит 3 в сутки, «скрывать суммы»,
 * повтор временной ошибки, снятие недействительного токена; адаптеры FCM HTTP v1 и Web Push на подменённом транспорте.
 */
import { generateKeyPairSync, randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { and, eq } from "drizzle-orm";
import { db, authSessions, notifications, pushDeliveries } from "@workspace/db";
import { notify } from "../src/services/notificationService";
import {
  deliverPush, DAILY_PUSH_LIMIT, maskAmounts, quietUntil, setPushAdaptersForTests,
} from "../src/services/push/pushService";
import { createFcmAdapter } from "../src/services/push/fcm";
import { createWebPushAdapter } from "../src/services/push/webpush";
import type { PushAdapter, PushMessage, PushResult } from "../src/services/push/types";
import type { PushProvider } from "../src/services/pushTokens";
import { app, auth, registerUser, type TestUser } from "./helpers";

/** Адаптер-заглушка: запоминает сообщения, отвечает по очереди заданными результатами (дальше — sent). */
function fakeAdapter(provider: PushProvider, results: PushResult[] = []) {
  const sent: { token: string; message: PushMessage }[] = [];
  const adapter: PushAdapter = {
    provider,
    send: async (token, message) => {
      sent.push({ token, message });
      return results.shift() ?? { status: "sent", providerMessageId: `msg-${sent.length}` };
    },
  };
  return { adapter, sent };
}

let fcm: ReturnType<typeof fakeAdapter>;
beforeEach(() => {
  fcm = fakeAdapter("fcm");
  setPushAdaptersForTests(new Map([["fcm", fcm.adapter]]));
});
afterEach(() => setPushAdaptersForTests(null));

/** Пользователь с устройством FCM; тихие часы выключены, чтобы тест не зависел от времени суток. */
async function withDevice(prefs: object = {}) {
  const user = await registerUser();
  const token = `fcm-${randomUUID()}`;
  expect((await request(app).put("/api/v1/devices/current/push").set(auth(user.token)).send({ provider: "fcm", token })).status).toBe(204);
  await request(app).put("/api/v1/notification-prefs").set(auth(user.token)).send({ quietHours: { start: 0, end: 0 }, ...prefs });
  return { user, token };
}
const deliveries = (user: TestUser) => db.select().from(pushDeliveries).where(eq(pushDeliveries.userId, user.id));
const budgetNotice = (user: TestUser, body = "Потрачено 12 500,00 ₽ из 10 000 ₽") =>
  notify(user.id, { type: "budget_threshold", title: "Бюджет «Продукты» превышен", body, deepLink: "/budgets?month=2026-10", dedupKey: randomUUID() });

describe("отправка после notify()", () => {
  it("уходит на устройство: заголовок, текст, в данных только id, тип и путь; доставка в журнале", async () => {
    const { user, token } = await withDevice();
    const notification = await budgetNotice(user);
    expect(fcm.sent).toHaveLength(1);
    expect(fcm.sent[0].token).toBe(token);
    expect(fcm.sent[0].message).toEqual({
      title: "Бюджет «Продукты» превышен",
      body: "Потрачено 12 500,00 ₽ из 10 000 ₽",
      data: { notificationId: notification!.id, type: "budget_threshold", deepLink: "/budgets?month=2026-10" },
    });
    expect(await deliveries(user)).toMatchObject([{ status: "sent", provider: "fcm", notificationId: notification!.id, providerMessageId: "msg-1" }]);
    const [row] = await db.select().from(notifications).where(eq(notifications.id, notification!.id));
    expect(row.pushProcessedAt).not.toBeNull();
  });

  it("push группы выключен или тип служебный — не уходит, уведомление в колокольчике есть", async () => {
    const { user } = await withDevice({ groups: [{ type: "budget_threshold", push: false }] });
    expect(await budgetNotice(user)).not.toBeNull();
    expect(await notify(user.id, { type: "system", title: "Служебное", dedupKey: randomUUID() })).not.toBeNull();
    expect(fcm.sent).toHaveLength(0);
    expect(await deliveries(user)).toEqual([]);
  });

  it("«скрывать суммы» — суммы в тексте заменены", async () => {
    const { user } = await withDevice({ hidePushAmounts: true });
    await budgetNotice(user);
    expect(fcm.sent[0].message.body).toBe("Потрачено ••• из •••");
  });
});

describe("deliverPush", () => {
  async function pending(user: TestUser, title: string, deepLink = "/recurring") {
    const [row] = await db.insert(notifications).values({ userId: user.id, type: "recurring_upcoming", title, deepLink }).returning();
    return row;
  }

  it("однотипные необработанные уведомления объединяются в один push", async () => {
    const { user } = await withDevice();
    await pending(user, "Завтра спишется Кинопоиск");
    const last = await pending(user, "Завтра спишется Яндекс Плюс");
    expect(await deliverPush({ userId: user.id, type: "recurring_upcoming" })).toBe("sent");
    expect(fcm.sent).toHaveLength(1);
    expect(fcm.sent[0].message).toMatchObject({
      title: "2 уведомления: скорое списание подписки",
      body: "Завтра спишется Кинопоиск · Завтра спишется Яндекс Плюс",
      data: { notificationId: last.id, deepLink: "/recurring" },
    });
    expect(await deliverPush({ userId: user.id, type: "recurring_upcoming" })).toBe("nothing");
  });

  it(`не больше ${DAILY_PUSH_LIMIT} push в сутки; сверх лимита — только колокольчик`, async () => {
    const { user } = await withDevice();
    for (let i = 0; i < DAILY_PUSH_LIMIT; i++) await budgetNotice(user);
    expect(fcm.sent).toHaveLength(DAILY_PUSH_LIMIT);
    await pending(user, "Ещё одно");
    expect(await deliverPush({ userId: user.id, type: "recurring_upcoming" })).toBe("capped");
    expect(fcm.sent).toHaveLength(DAILY_PUSH_LIMIT);
  });

  it("тихие часы: ночью по Москве — отложено, ничего не ушло и не помечено", async () => {
    const { user } = await withDevice({ quietHours: { start: 22, end: 9 } });
    const row = await pending(user, "Завтра спишется Окко");
    const night = new Date("2026-10-27T20:30:00Z"); // 23:30 МСК
    expect(await deliverPush({ userId: user.id, type: "recurring_upcoming" }, night)).toBe("deferred");
    expect(fcm.sent).toHaveLength(0);
    expect((await db.select().from(notifications).where(eq(notifications.id, row.id)))[0].pushProcessedAt).toBeNull();
    expect(await deliverPush({ userId: user.id, type: "recurring_upcoming" }, new Date("2026-10-28T06:00:00Z"))).toBe("sent");
  });

  it("временная ошибка повторяется; недействительный токен снимается с устройства", async () => {
    const { user } = await withDevice();
    fcm = fakeAdapter("fcm", [{ status: "retry", error: "503" }]);
    setPushAdaptersForTests(new Map([["fcm", fcm.adapter]]));
    await budgetNotice(user);
    expect(fcm.sent).toHaveLength(2);
    expect((await deliveries(user))[0].status).toBe("sent");

    fcm = fakeAdapter("fcm", [{ status: "invalid_token", error: "404 UNREGISTERED" }]);
    setPushAdaptersForTests(new Map([["fcm", fcm.adapter]]));
    await pending(user, "Завтра спишется Окко");
    expect(await deliverPush({ userId: user.id, type: "recurring_upcoming" })).toBe("failed");
    const [session] = await db.select().from(authSessions).where(eq(authSessions.id, user.sessionId));
    expect(session.pushToken).toBeNull();
    expect(await db.select().from(pushDeliveries).where(and(eq(pushDeliveries.userId, user.id), eq(pushDeliveries.status, "invalid_token")))).toHaveLength(1);
  });

  it("нет адаптера провайдера (RuStore до T3) — запись no_adapter, без ошибки", async () => {
    const user = await registerUser();
    await request(app).put("/api/v1/devices/current/push").set(auth(user.token)).send({ provider: "rustore", token: `ru-${randomUUID()}` });
    await request(app).put("/api/v1/notification-prefs").set(auth(user.token)).send({ quietHours: { start: 0, end: 0 } });
    await budgetNotice(user);
    expect((await deliveries(user)).map((row) => row.status)).toEqual(["no_adapter"]);
  });
});

describe("тихие часы и маскирование", () => {
  it("quietUntil: ночь — до 9:00 по местному времени, день — null, начало = конец — без тихих часов", () => {
    expect(quietUntil(new Date("2026-10-27T20:30:00Z"), "Europe/Moscow", 22, 9)?.toISOString()).toBe("2026-10-28T06:00:00.000Z");
    expect(quietUntil(new Date("2026-10-28T05:59:00Z"), "Europe/Moscow", 22, 9)?.toISOString()).toBe("2026-10-28T06:00:00.000Z");
    expect(quietUntil(new Date("2026-10-28T09:00:00Z"), "Europe/Moscow", 22, 9)).toBeNull();
    expect(quietUntil(new Date("2026-10-27T20:30:00Z"), "Europe/Moscow", 0, 0)).toBeNull();
    expect(quietUntil(new Date("2026-10-27T23:00:00Z"), "Asia/Vladivostok", 1, 6)).toBeNull(); // 09:00 во Владивостоке
    expect(quietUntil(new Date("2026-10-27T17:30:00Z"), "Asia/Vladivostok", 1, 6)?.toISOString()).toBe("2026-10-27T20:00:00.000Z");
  });

  it("maskAmounts: суммы с валютой — «•••», проценты и названия остаются", () => {
    expect(maskAmounts("Потрачено 12 500,00 ₽ из 10 000 ₽ (125%)")).toBe("Потрачено ••• из ••• (125%)");
    expect(maskAmounts("Списание −1 299 руб. за Кинопоиск")).toBe("Списание ••• за Кинопоиск");
    expect(maskAmounts("$15 и 20 EUR")).toBe("••• и •••");
    expect(maskAmounts("Бюджет «Продукты» 80%")).toBe("Бюджет «Продукты» 80%");
  });
});

describe("адаптеры", () => {
  const message: PushMessage = { title: "T", body: "B", data: { notificationId: "n1", type: "budget_threshold", deepLink: "/" } };

  it("FCM: токен доступа один на час, ответы 200/404/503 — sent/invalid_token/retry", async () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
    const calls: string[] = [];
    const replies = [
      new Response(JSON.stringify({ name: "projects/p/messages/1" }), { status: 200 }),
      new Response(JSON.stringify({ error: { status: "NOT_FOUND", details: [{ errorCode: "UNREGISTERED" }] } }), { status: 404 }),
      new Response("unavailable", { status: 503 }),
    ];
    const fakeFetch = (async (url: string | URL, init?: RequestInit) => {
      calls.push(String(url));
      if (String(url).includes("oauth2")) {
        expect(String(init?.body)).toContain("grant_type=urn");
        return new Response(JSON.stringify({ access_token: "at", expires_in: 3600 }), { status: 200 });
      }
      expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer at");
      return replies.shift()!;
    }) as typeof fetch;
    const adapter = createFcmAdapter({ project_id: "p", client_email: "sa@p.iam.gserviceaccount.com", private_key: privateKey }, fakeFetch);
    expect(await adapter.send("tok", message)).toEqual({ status: "sent", providerMessageId: "projects/p/messages/1" });
    expect((await adapter.send("tok", message)).status).toBe("invalid_token");
    expect((await adapter.send("tok", message)).status).toBe("retry");
    expect(calls.filter((url) => url.includes("oauth2"))).toHaveLength(1);
    expect(calls.filter((url) => url.endsWith("/v1/projects/p/messages:send"))).toHaveLength(3);
  });

  it("Web Push: 201 — sent, 410 — invalid_token, 500 — retry, подписка не JSON — invalid_token", async () => {
    const statuses = [201, 410, 500];
    const send = (async () => {
      const status = statuses.shift()!;
      if (status >= 300) throw Object.assign(new Error("push service"), { statusCode: status });
      return { statusCode: status, body: "", headers: { location: "https://push.example.test/m/1" } };
    }) as unknown as Parameters<typeof createWebPushAdapter>[1];
    const adapter = createWebPushAdapter({ publicKey: "pub", privateKey: "priv", subject: "mailto:test@example.test" }, send);
    const subscription = JSON.stringify({ endpoint: "https://push.example.test/1", keys: { p256dh: "k", auth: "a" } });
    expect(await adapter.send(subscription, message)).toEqual({ status: "sent", providerMessageId: "https://push.example.test/m/1" });
    expect((await adapter.send(subscription, message)).status).toBe("invalid_token");
    expect((await adapter.send(subscription, message)).status).toBe("retry");
    expect((await adapter.send("not json", message)).status).toBe("invalid_token");
  });

  it("GET /api/v1/push/vapid-public-key без входа; без ключей — null", async () => {
    const res = await request(app).get("/api/v1/push/vapid-public-key");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ publicKey: null });
  });
});
