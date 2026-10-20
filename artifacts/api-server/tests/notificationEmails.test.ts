/**
 * Письма об уведомлениях (D19, #93): перерасход бюджета — письмом, 80% — нет; только подтверждённый e-mail и
 * включённый переключатель; одно письмо на уведомление даже при повторе; сбой SMTP — повтор; «Отписаться» по ссылке;
 * настройки GET/PATCH; годовая подписка и пробный период — письмом, ежемесячная — нет.
 */
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { and, eq } from "drizzle-orm";
import { db, categories, notifications, recurringSeries, users } from "@workspace/db";
import { jobDefinitions } from "../src/jobs/definitions";
import { checkBudgetAlerts } from "../src/services/budgetAlertService";
import { emailService } from "../src/services/emailService";
import {
  deliverNotificationEmail, renderEmail, unsubscribeToken, verifyUnsubscribeToken,
} from "../src/services/notificationEmailService";
import { notify } from "../src/services/notificationService";
import { addDays, addMonths } from "../src/services/recurring/detector";
import { sendReminders } from "../src/services/recurring/reminderService";
import { detectForUser, todayMsk } from "../src/services/recurring/recurringService";
import { app, auth, registerUser, type TestUser } from "./helpers";

const TODAY = todayMsk();
const code = async (value: string) => (await db.select().from(categories).where(eq(categories.code, value)))[0].id;
const post = (user: TestUser, url: string, body: object) => request(app).post(url).set(auth(user.token)).send(body);

let sendEmail: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  sendEmail = vi.spyOn(emailService, "sendEmail").mockResolvedValue({ success: true, messageId: "test" });
});
afterEach(() => {
  vi.restoreAllMocks();
});

async function emailOf(userId: string) {
  return (await db.select({ email: users.email }).from(users).where(eq(users.id, userId)))[0].email!;
}
const sentTo = (address: string) => sendEmail.mock.calls.filter(([options]) => (options as { to: string }).to === address);

/** Пользователь с подтверждённым e-mail и картой. */
async function setup({ verified = true } = {}) {
  const user = await registerUser();
  await db.update(users).set({ isEmailVerified: verified }).where(eq(users.id, user.id));
  const acc = await post(user, "/api/v1/accounts", { name: `Карта ${randomUUID().slice(0, 6)}`, kind: "debit_card", openingBalance: "500000.00", openingBalanceDate: addDays(TODAY, -400) });
  return { user, card: acc.body.id as string, address: await emailOf(user.id) };
}

describe("бюджет: письмо только о перерасходе", () => {
  it("80% — без письма, 100% — одно письмо со ссылкой на бюджеты и «Отписаться»", async () => {
    const { user, card, address } = await setup();
    const food = await code("food");
    await post(user, "/api/v1/budgets", { categoryId: food, amount: "10000" });
    await post(user, "/api/v1/transactions", { type: "expense", accountId: card, categoryId: food, amount: "8500", date: TODAY });
    await checkBudgetAlerts(user.id);
    expect(sentTo(address)).toHaveLength(0);

    await post(user, "/api/v1/transactions", { type: "expense", accountId: card, categoryId: food, amount: "2000", date: TODAY });
    await checkBudgetAlerts(user.id);
    await checkBudgetAlerts(user.id);
    const mails = sentTo(address);
    expect(mails).toHaveLength(1);
    const mail = mails[0][0] as { subject: string; html: string; text: string };
    expect(mail.subject).toBe("Бюджет «Продукты» превышен");
    expect(mail.html).toContain("/budgets?month=");
    expect(mail.text).toContain(`/api/v1/email/unsubscribe?token=${encodeURIComponent(unsubscribeToken(user.id))}`);
    const [row] = await db.select().from(notifications).where(and(eq(notifications.userId, user.id), eq(notifications.title, mail.subject)));
    expect(row.emailedAt).not.toBeNull();
  });
});

describe("кому и сколько раз", () => {
  it("неподтверждённый e-mail и выключенные письма — без письма, уведомление остаётся", async () => {
    const unverified = await setup({ verified: false });
    const n1 = await notify(unverified.user.id, { type: "system", title: "Проверка", dedupKey: randomUUID() });
    expect(await deliverNotificationEmail(n1!.id)).toBe("skipped");

    const off = await setup();
    await request(app).patch("/api/v1/notifications/settings").set(auth(off.user.token)).send({ email: false });
    const n2 = await notify(off.user.id, { type: "system", title: "Проверка", dedupKey: randomUUID() });
    expect(await deliverNotificationEmail(n2!.id)).toBe("skipped");
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("повтор задачи не шлёт второе письмо; сбой SMTP — отметка снимается и задача падает для повтора", async () => {
    const { user, address } = await setup();
    const n = await notify(user.id, { type: "system", title: "Раз", body: "<b>не тег</b>", dedupKey: randomUUID() });
    expect(await deliverNotificationEmail(n!.id)).toBe("sent");
    expect(await deliverNotificationEmail(n!.id)).toBe("skipped");
    expect(sentTo(address)).toHaveLength(1);
    expect((sentTo(address)[0][0] as { html: string }).html).toContain("&lt;b&gt;не тег&lt;/b&gt;");

    sendEmail.mockResolvedValueOnce({ success: false, error: "SMTP недоступен" });
    const failed = await notify(user.id, { type: "system", title: "Два", dedupKey: randomUUID() });
    await expect(deliverNotificationEmail(failed!.id)).rejects.toThrow("SMTP недоступен");
    expect((await db.select().from(notifications).where(eq(notifications.id, failed!.id)))[0].emailedAt).toBeNull();
    expect(await deliverNotificationEmail(failed!.id)).toBe("sent");
  });

  it("задача notifications.email с повторами", () => {
    expect(jobDefinitions.find((job) => job.name === "notifications.email")?.options).toMatchObject({ retryLimit: 3 });
  });
});

describe("«Отписаться» и настройки", () => {
  it("ссылка из письма выключает письма без входа; чужая или испорченная подпись — 400", async () => {
    const { user } = await setup();
    expect(verifyUnsubscribeToken(unsubscribeToken(user.id))).toBe(user.id);
    expect(verifyUnsubscribeToken(`${user.id}.${unsubscribeToken(randomUUID()).split(".")[1]}`)).toBeNull();
    expect((await request(app).get("/api/v1/email/unsubscribe?token=broken")).status).toBe(400);

    const res = await request(app).get(`/api/v1/email/unsubscribe?token=${encodeURIComponent(unsubscribeToken(user.id))}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain("Письма отключены");
    expect((await request(app).get("/api/v1/notifications/settings").set(auth(user.token))).body).toMatchObject({ email: false, addressVerified: true });
  });

  it("GET и PATCH настроек: только свои, тело строгое", async () => {
    const a = await setup();
    const b = await setup();
    expect((await request(app).get("/api/v1/notifications/settings").set(auth(a.user.token))).body).toEqual({ email: true, address: a.address, addressVerified: true });
    expect((await request(app).patch("/api/v1/notifications/settings").set(auth(b.user.token)).send({ email: false })).body.email).toBe(false);
    expect((await request(app).get("/api/v1/notifications/settings").set(auth(a.user.token))).body.email).toBe(true);
    expect((await request(app).patch("/api/v1/notifications/settings").set(auth(a.user.token)).send({ email: "нет" })).status).toBe(400);
    expect((await request(app).patch("/api/v1/notifications/settings").set(auth(a.user.token)).send({ email: true, userId: b.user.id })).status).toBe(400);
  });
});

describe("подписки", () => {
  it("напоминание о годовой подписке — письмом, о ежемесячной — только в приложении", async () => {
    const { user, card, address } = await setup();
    for (let i = 3; i >= 0; i--) await post(user, "/api/v1/transactions", { type: "expense", accountId: card, amount: "299", description: "YANDEX PLUS", date: addMonths(addDays(TODAY, -3), -i) });
    for (let i = 3; i >= 0; i--) await post(user, "/api/v1/transactions", { type: "expense", accountId: card, amount: "399", description: "OKKO", date: addMonths(addDays(TODAY, -5), -i) });
    await detectForUser(user.id);
    const series = await db.select().from(recurringSeries).where(eq(recurringSeries.userId, user.id));
    const plus = series.find((s) => s.displayName === "Яндекс Плюс")!;
    const okko = series.find((s) => s.displayName === "Okko")!;
    await db.update(recurringSeries).set({ status: "confirmed", nextExpectedDate: addDays(TODAY, 2) }).where(eq(recurringSeries.id, okko.id));
    await db.update(recurringSeries).set({ status: "confirmed", periodicity: "yearly", nextExpectedDate: addDays(TODAY, 2) }).where(eq(recurringSeries.id, plus.id));
    await sendReminders();
    const subjects = sentTo(address).map(([options]) => (options as { subject: string }).subject);
    expect(subjects).toHaveLength(1);
    expect(subjects[0]).toContain("Яндекс Плюс");
  });
});

describe("списание после отмены", () => {
  it("письмо о новом списании по отменённой подписке", async () => {
    const { user, card, address } = await setup();
    for (let i = 3; i >= 0; i--) await post(user, "/api/v1/transactions", { type: "expense", accountId: card, amount: "399", description: "OKKO", date: addMonths(addMonths(TODAY, -1), -i) });
    await detectForUser(user.id);
    const [okko] = await db.select().from(recurringSeries).where(and(eq(recurringSeries.userId, user.id), eq(recurringSeries.displayName, "Okko")));
    await db.update(recurringSeries).set({ status: "cancelled", cancelledAt: new Date(Date.now() - 10 * 86_400_000) }).where(eq(recurringSeries.id, okko.id));
    await post(user, "/api/v1/transactions", { type: "expense", accountId: card, amount: "399", description: "OKKO", date: TODAY });
    await detectForUser(user.id);
    await detectForUser(user.id);
    const subjects = sentTo(address).map(([options]) => (options as { subject: string }).subject.replace(/\u00a0/g, " "));
    expect(subjects).toEqual(["«Okko» списала 399 ₽ после отмены"]);
  });
});

describe("renderEmail", () => {
  it("ссылка «Открыть» ведёт на deepLink сайта", () => {
    const mail = renderEmail({ title: "Т", body: null, deepLink: "/subscriptions?open=1" }, randomUUID());
    expect(mail.html).toMatch(/href="https?:\/\/[^"]+\/subscriptions\?open=1"/);
  });
});
