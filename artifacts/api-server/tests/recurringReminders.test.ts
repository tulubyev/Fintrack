/**
 * Напоминания о списаниях и «списалась после отмены» (E1.6-T5): одно уведомление на одно списание, только подтверждённые
 * серии и пробные периоды, окно remind_days_before, повтор без дублей, чужие уведомления не видны.
 */
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { and, eq } from "drizzle-orm";
import { db, notifications, recurringSeries } from "@workspace/db";
import { jobDefinitions } from "../src/jobs/definitions";
import { addDays, addMonths } from "../src/services/recurring/detector";
import { reminderMessage, sendReminders } from "../src/services/recurring/reminderService";
import { detectForUser, todayMsk } from "../src/services/recurring/recurringService";
import { app, auth, registerUser, type TestUser } from "./helpers";

const TODAY = todayMsk();
// суммы в текстах — с неразрывными пробелами
const plain = (text: string | null | undefined) => (text ?? "").replace(/\u00a0/g, " ");

async function setup() {
  const user = await registerUser();
  const acc = await request(app).post("/api/v1/accounts").set(auth(user.token))
    .send({ name: `Карта ${randomUUID().slice(0, 6)}`, kind: "debit_card", openingBalance: "900000.00", openingBalanceDate: addDays(TODAY, -400) });
  return { user, card: acc.body.id as string };
}

async function monthly(user: TestUser, card: string, description: string, amount: string, n: number, last: string) {
  for (let i = n - 1; i >= 0; i--) {
    const res = await request(app).post("/api/v1/transactions").set(auth(user.token))
      .send({ type: "expense", accountId: card, amount, description, date: addMonths(last, -i) });
    expect(res.status).toBe(201);
  }
}

const seriesOf = async (userId: string, displayName: string) =>
  (await db.select().from(recurringSeries).where(and(eq(recurringSeries.userId, userId), eq(recurringSeries.displayName, displayName))))[0];
const notificationsOf = (userId: string) => db.select().from(notifications).where(eq(notifications.userId, userId));

describe("reminderMessage", () => {
  it("сумма и срок; у пробного периода без суммы — о платных списаниях", () => {
    const plus = { displayName: "Яндекс Плюс", kind: "subscription" as const, expectedAmount: "299.00", currency: "RUB" };
    expect(plain(reminderMessage(plus, 2).title)).toBe("Через 2 дня спишется «Яндекс Плюс» — 299 ₽");
    expect(plain(reminderMessage(plus, 1).title)).toBe("Завтра спишется «Яндекс Плюс» — 299 ₽");
    expect(plain(reminderMessage({ ...plus, expectedAmount: "1299.50" }, 5).title)).toBe("Через 5 дней спишется «Яндекс Плюс» — 1 299,50 ₽");
    const trial = reminderMessage({ displayName: "Okko", kind: "trial", expectedAmount: null, currency: "RUB" }, 2);
    expect(trial.title).toBe("Через 2 дня закончится пробный период «Okko»");
    expect(trial.body).toContain("платные списания");
  });
});

describe("sendReminders", () => {
  let a: TestUser;

  beforeAll(async () => {
    const { user, card } = await setup();
    a = user;
    await monthly(a, card, "YANDEX PLUS", "299", 4, addDays(TODAY, -3));
    await monthly(a, card, "OKKO", "399", 4, addDays(TODAY, -5));
    await monthly(a, card, "KINOPOISK", "299", 4, addDays(TODAY, -7));
    await monthly(a, card, "IVI", "399", 4, addDays(TODAY, -9));
    await detectForUser(a.id);
  });

  it("подтверждённая серия в окне — одно уведомление со ссылкой на карточку; повтор не дублирует", async () => {
    const plus = await seriesOf(a.id, "Яндекс Плюс");
    await db.update(recurringSeries).set({ status: "confirmed", remindDaysBefore: 2, nextExpectedDate: addDays(TODAY, 2) }).where(eq(recurringSeries.id, plus.id));
    await sendReminders();
    await sendReminders();
    const mine = (await notificationsOf(a.id)).filter((n) => n.type === "recurring_upcoming");
    expect(mine).toHaveLength(1);
    expect(plain(mine[0].title)).toBe("Через 2 дня спишется «Яндекс Плюс» — 299 ₽");
    expect(mine[0]).toMatchObject({
      deepLink: `/subscriptions?open=${plus.id}`,
      dedupKey: `recurring:${plus.id}:${addDays(TODAY, 2)}`,
    });
  });

  it("без напоминаний: не подтверждена, вне окна, «не напоминать», отменена", async () => {
    const okko = await seriesOf(a.id, "Okko");
    const kp = await seriesOf(a.id, "Кинопоиск");
    const ivi = await seriesOf(a.id, "Иви");
    await db.update(recurringSeries).set({ status: "detected", remindDaysBefore: 3, nextExpectedDate: addDays(TODAY, 1) }).where(eq(recurringSeries.id, okko.id));
    await db.update(recurringSeries).set({ status: "confirmed", remindDaysBefore: 2, nextExpectedDate: addDays(TODAY, 3) }).where(eq(recurringSeries.id, kp.id));
    await db.update(recurringSeries).set({ status: "confirmed", remindDaysBefore: 0, nextExpectedDate: addDays(TODAY, 1) }).where(eq(recurringSeries.id, ivi.id));
    await sendReminders();
    const keys = (await notificationsOf(a.id)).map((n) => n.dedupKey);
    expect(keys.some((key) => key?.includes(okko.id))).toBe(false);
    expect(keys.some((key) => key?.includes(kp.id))).toBe(false);
    expect(keys.some((key) => key?.includes(ivi.id))).toBe(false);

    await db.update(recurringSeries).set({ status: "cancelled", remindDaysBefore: 2, nextExpectedDate: addDays(TODAY, 1) }).where(eq(recurringSeries.id, kp.id));
    await sendReminders();
    expect((await notificationsOf(a.id)).some((n) => n.dedupKey?.includes(kp.id))).toBe(false);
  });

  it("пробный период напоминает и без подтверждения", async () => {
    const okko = await seriesOf(a.id, "Okko");
    await db.update(recurringSeries).set({ kind: "trial", expectedAmount: null, status: "detected", remindDaysBefore: 2, nextExpectedDate: TODAY }).where(eq(recurringSeries.id, okko.id));
    await sendReminders();
    const trial = (await notificationsOf(a.id)).find((n) => n.dedupKey === `recurring:${okko.id}:${TODAY}`);
    expect(trial?.title).toBe("Сегодня закончится пробный период «Okko»");
  });

  it("задача recurring.remind — каждый день в 10:00", () => {
    expect(jobDefinitions.find((item) => item.name === "recurring.remind")?.cron).toBe("0 10 * * *");
  });
});

describe("списание после отмены", () => {
  it("новое списание после даты отмены — уведомление один раз, серия остаётся отменённой; B его не видит", async () => {
    const { user, card } = await setup();
    const last = addMonths(TODAY, -1);
    await monthly(user, card, "OKKO", "399", 4, last);
    await detectForUser(user.id);
    const okko = await seriesOf(user.id, "Okko");
    // отменил 10 дней назад, а сегодня снова списали
    await db.update(recurringSeries).set({ status: "cancelled", cancelledAt: new Date(Date.now() - 10 * 86_400_000) }).where(eq(recurringSeries.id, okko.id));
    await detectForUser(user.id);
    expect((await notificationsOf(user.id)).filter((n) => n.type === "recurring_after_cancel")).toHaveLength(0);

    await request(app).post("/api/v1/transactions").set(auth(user.token)).send({ type: "expense", accountId: card, amount: "399", description: "OKKO", date: TODAY });
    await detectForUser(user.id);
    await detectForUser(user.id);
    const alerts = (await notificationsOf(user.id)).filter((n) => n.type === "recurring_after_cancel");
    expect(alerts).toHaveLength(1);
    expect(plain(alerts[0].title)).toBe("«Okko» списала 399 ₽ после отмены");
    expect(alerts[0].deepLink).toBe(`/subscriptions?open=${okko.id}`);
    expect((await seriesOf(user.id, "Okko")).status).toBe("cancelled");

    const { user: b } = await setup();
    const list = await request(app).get("/api/v1/notifications?limit=50").set(auth(b.token));
    expect(list.body.items).toEqual([]);
  });
});
