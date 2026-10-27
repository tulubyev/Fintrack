/**
 * Настройки уведомлений и push-токены устройств (E2.2-T1): значения по умолчанию, частичное обновление, проверка ввода,
 * B не видит настроек A; письмо учитывает настройку группы; токен зашифрован, переезжает к новой сессии и стирается
 * при отзыве сессии.
 */
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { db, authSessions, users } from "@workspace/db";
import { emailService } from "../src/services/emailService";
import { deliverNotificationEmail } from "../src/services/notificationEmailService";
import { notify } from "../src/services/notificationService";
import { pushTargets } from "../src/services/pushTokens";
import { app, auth, registerUser, type TestUser } from "./helpers";

const getPrefs = (user: TestUser) => request(app).get("/api/v1/notification-prefs").set(auth(user.token));
const putPrefs = (user: TestUser, body: object) => request(app).put("/api/v1/notification-prefs").set(auth(user.token)).send(body);
const putPush = (user: TestUser, body: object) => request(app).put("/api/v1/devices/current/push").set(auth(user.token)).send(body);
const group = (body: { groups: { type: string }[] }, type: string) => body.groups.find((item) => item.type === type);

describe("GET/PUT /api/v1/notification-prefs", () => {
  it("по умолчанию: push включён, письма — у групп с письмами, новости выключены, тихие часы 22–9", async () => {
    const user = await registerUser();
    const res = await getPrefs(user);
    expect(res.status).toBe(200);
    expect(res.body.groups).toHaveLength(7);
    expect(group(res.body, "budget_threshold")).toMatchObject({ push: true, email: true, emailAvailable: true });
    expect(group(res.body, "goal_reached")).toMatchObject({ push: true, email: false, emailAvailable: false });
    expect(group(res.body, "product_news")).toMatchObject({ push: false, email: false });
    expect(res.body.quietHours).toEqual({ start: 22, end: 9 });
    expect(res.body.hidePushAmounts).toBe(false);
    expect(res.body.email).toMatchObject({ enabled: true });
  });

  it("частичное обновление сохраняет остальное; письмо у группы без писем не включается", async () => {
    const user = await registerUser();
    await putPrefs(user, { groups: [{ type: "recurring_new", push: false }] });
    const res = await putPrefs(user, {
      groups: [{ type: "goal_reached", email: true }, { type: "budget_threshold", email: false }],
      quietHours: { start: 23, end: 7 },
      hidePushAmounts: true,
    });
    expect(res.status).toBe(200);
    expect(group(res.body, "recurring_new")).toMatchObject({ push: false, email: true });
    expect(group(res.body, "goal_reached")).toMatchObject({ push: true, email: false });
    expect(group(res.body, "budget_threshold")).toMatchObject({ push: true, email: false });
    expect(res.body.quietHours).toEqual({ start: 23, end: 7 });
    expect(res.body.hidePushAmounts).toBe(true);
    expect((await getPrefs(user)).body).toEqual(res.body);
  });

  it("неверный ввод — 400", async () => {
    const user = await registerUser();
    expect((await putPrefs(user, { quietHours: { start: 24, end: 7 } })).status).toBe(400);
    expect((await putPrefs(user, { groups: [{ type: "system", push: true }] })).status).toBe(400);
    expect((await putPrefs(user, { inApp: false })).status).toBe(400);
    expect((await request(app).get("/api/v1/notification-prefs")).status).toBe(401);
  });

  it("B не видит и не меняет настройки A", async () => {
    const a = await registerUser();
    const b = await registerUser();
    await putPrefs(a, { groups: [{ type: "import", push: false }], hidePushAmounts: true });
    const bPrefs = (await getPrefs(b)).body;
    expect(group(bPrefs, "import")).toMatchObject({ push: true });
    expect(bPrefs.hidePushAmounts).toBe(false);
    await putPrefs(b, { groups: [{ type: "import", push: true }] });
    expect(group((await getPrefs(a)).body, "import")).toMatchObject({ push: false });
  });
});

describe("письма учитывают настройку группы", () => {
  let sendEmail: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    sendEmail = vi.spyOn(emailService, "sendEmail").mockResolvedValue({ success: true, messageId: "test" });
  });
  afterEach(() => vi.restoreAllMocks());

  it("письма о бюджетах выключены — письма нет; уведомление system по-прежнему решает вызывающий", async () => {
    const user = await registerUser();
    await db.update(users).set({ isEmailVerified: true }).where(eq(users.id, user.id));
    await putPrefs(user, { groups: [{ type: "budget_threshold", email: false }] });
    const budget = await notify(user.id, { type: "budget_threshold", title: "Бюджет превышен", dedupKey: randomUUID() });
    expect(await deliverNotificationEmail(budget!.id)).toBe("skipped");

    const system = await notify(user.id, { type: "system", title: "Служебное", dedupKey: randomUUID() });
    expect(await deliverNotificationEmail(system!.id)).toBe("sent");
    expect(sendEmail).toHaveBeenCalledTimes(1);

    await putPrefs(user, { groups: [{ type: "budget_threshold", email: true }] });
    const again = await notify(user.id, { type: "budget_threshold", title: "Бюджет превышен снова", dedupKey: randomUUID() });
    expect(await deliverNotificationEmail(again!.id)).toBe("sent");
  });
});

describe("PUT/DELETE /api/v1/devices/current/push", () => {
  const token = () => `fcm-${randomUUID()}`;

  it("сохраняет токен зашифрованным, отдаёт его отправке и стирает по DELETE", async () => {
    const user = await registerUser();
    const value = token();
    expect((await putPush(user, { provider: "fcm", token: value })).status).toBe(204);
    const [row] = await db.select().from(authSessions).where(eq(authSessions.id, user.sessionId));
    expect(row.pushProvider).toBe("fcm");
    expect(row.pushToken).toMatch(/^enc:v1:/);
    expect(row.pushToken).not.toContain(value);
    expect(await pushTargets(user.id)).toEqual([{ sessionId: user.sessionId, provider: "fcm", token: value }]);

    expect((await request(app).delete("/api/v1/devices/current/push").set(auth(user.token))).status).toBe(204);
    expect(await pushTargets(user.id)).toEqual([]);
  });

  it("тот же токен у другого пользователя (вход на том же телефоне) — переезжает, у A пусто", async () => {
    const a = await registerUser();
    const b = await registerUser();
    const value = token();
    await putPush(a, { provider: "fcm", token: value });
    expect((await putPush(b, { provider: "fcm", token: value })).status).toBe(204);
    expect(await pushTargets(a.id)).toEqual([]);
    expect(await pushTargets(b.id)).toEqual([{ sessionId: b.sessionId, provider: "fcm", token: value }]);
  });

  it("отзыв сессии стирает токен; с отозванной сессией токен не сохранить", async () => {
    const user = await registerUser();
    await putPush(user, { provider: "webpush", token: JSON.stringify({ endpoint: "https://push.example.test/1", keys: { p256dh: "k", auth: "a" } }) });
    expect(await pushTargets(user.id)).toHaveLength(1);
    expect((await request(app).delete(`/api/auth/sessions/${user.sessionId}`).set(auth(user.token))).status).toBe(200);
    const [row] = await db.select().from(authSessions).where(eq(authSessions.id, user.sessionId));
    expect(row.revokedAt).not.toBeNull();
    expect(row.pushToken).toBeNull();
    expect(await pushTargets(user.id)).toEqual([]);
    expect((await putPush(user, { provider: "fcm", token: token() })).status).toBe(401);
  });

  it("неверный провайдер или пустой токен — 400; без входа — 401", async () => {
    const user = await registerUser();
    expect((await putPush(user, { provider: "hms", token: token() })).status).toBe(400);
    expect((await putPush(user, { provider: "fcm", token: " " })).status).toBe(400);
    expect((await request(app).put("/api/v1/devices/current/push").send({ provider: "fcm", token: token() })).status).toBe(401);
  });
});
