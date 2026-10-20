/**
 * Регулярные платежи с базой (E1.6-T1/T2): справочник сервисов из миграции, детекция по операциям пользователя,
 * идемпотентность, ignored не возвращается, переводы не считаются, данные разных пользователей не смешиваются.
 */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { and, eq, isNotNull } from "drizzle-orm";
import { db, recurringSeries, subscriptionServices, transactions } from "@workspace/db";
import { jobDefinitions } from "../src/jobs/definitions";
import { addDays, addMonths, normalizeText } from "../src/services/recurring/detector";
import { detectForUser, todayMsk } from "../src/services/recurring/recurringService";
import { app, auth, registerUser, type TestUser } from "./helpers";

const TODAY = todayMsk();
const post = (user: TestUser, url: string, body: object) => request(app).post(url).set(auth(user.token)).send(body);

async function setup() {
  const user = await registerUser();
  const card = await post(user, "/api/v1/accounts", { name: `Карта ${randomUUID().slice(0, 6)}`, kind: "debit_card", openingBalance: "500000.00", openingBalanceDate: addDays(TODAY, -400) });
  const savings = await post(user, "/api/v1/accounts", { name: "Накопительный", kind: "savings", openingBalance: "0.00", openingBalanceDate: addDays(TODAY, -400) });
  return { user, card: card.body.id as string, savings: savings.body.id as string };
}

async function monthly(user: TestUser, body: Record<string, unknown>, n: number, lastDate = addDays(TODAY, -3)) {
  for (let i = n - 1; i >= 0; i--) {
    const res = await post(user, "/api/v1/transactions", { ...body, date: addMonths(lastDate, -i) });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
  }
}

const seriesOf = (userId: string) => db.select().from(recurringSeries).where(eq(recurringSeries.userId, userId));

describe("справочник сервисов", () => {
  it("не меньше 40 сервисов, у каждого шаги отмены, паттерны в нормализованном виде, коды уникальны", async () => {
    const rows = await db.select().from(subscriptionServices);
    expect(rows.length).toBeGreaterThanOrEqual(40);
    for (const row of rows) {
      expect(row.cancelSteps, row.code).toBeTruthy();
      expect(row.patterns.length, row.code).toBeGreaterThan(0);
      for (const pattern of row.patterns) expect(normalizeText(pattern), `${row.code}: ${pattern}`).toBe(pattern);
    }
    expect(new Set(rows.map((row) => row.code)).size).toBe(rows.length);
    expect(rows.map((row) => row.serviceGroup)).toEqual(expect.arrayContaining(["video", "music", "bundle", "telecom", "store"]));
  });
});

describe("детекция для пользователя", () => {
  it("подписка и зарплата найдены, операции привязаны; повторный запуск без дублей; ignored не возвращается", async () => {
    const { user, card } = await setup();
    await monthly(user, { type: "expense", accountId: card, amount: "299", merchant: "YANDEX*5815*PLUS", description: "Оплата" }, 5);
    await monthly(user, { type: "income", accountId: card, amount: "120000", description: "Заработная плата ООО Ромашка" }, 4);
    await post(user, "/api/v1/transactions", { type: "expense", accountId: card, amount: "650", description: "Кафе", date: addDays(TODAY, -2) });

    const first = await detectForUser(user.id);
    expect(first).toMatchObject({ created: 2, updated: 0, total: 2 });
    const rows = await seriesOf(user.id);
    const plus = rows.find((row) => row.direction === "out")!;
    expect(plus).toMatchObject({ kind: "subscription", displayName: "Яндекс Плюс", periodicity: "monthly", amountLast: "299.00", occurrences: 5, status: "detected", source: "detector" });
    expect(plus.serviceId).not.toBeNull();
    expect(rows.find((row) => row.direction === "in")).toMatchObject({ kind: "salary", amountLast: "120000.00" });

    const linked = await db.select().from(transactions).where(and(eq(transactions.userId, user.id), isNotNull(transactions.recurringSeriesId)));
    expect(linked).toHaveLength(9);

    expect(await detectForUser(user.id)).toMatchObject({ created: 0, updated: 2 });
    expect(await seriesOf(user.id)).toHaveLength(2);

    await db.update(recurringSeries).set({ status: "ignored" }).where(eq(recurringSeries.id, plus.id));
    expect(await detectForUser(user.id)).toMatchObject({ created: 0, updated: 1 });
    const after = await seriesOf(user.id);
    expect(after).toHaveLength(2);
    expect(after.find((row) => row.id === plus.id)!.status).toBe("ignored");
  });

  it("подтверждённой серии детектор не меняет название; переводы между своими счетами не считаются", async () => {
    const { user, card, savings } = await setup();
    await monthly(user, { type: "expense", accountId: card, amount: "399", description: "OKKO" }, 4);
    for (let i = 3; i >= 0; i--) {
      const res = await post(user, "/api/v1/transfers", { fromAccountId: card, toAccountId: savings, amount: "10000", date: addMonths(addDays(TODAY, -5), -i) });
      expect(res.status, JSON.stringify(res.body)).toBe(201);
    }
    await detectForUser(user.id);
    const [okko] = await seriesOf(user.id);
    expect((await seriesOf(user.id))).toHaveLength(1);
    await db.update(recurringSeries).set({ status: "confirmed", displayName: "Кино по выходным" }).where(eq(recurringSeries.id, okko.id));
    await detectForUser(user.id);
    const [again] = await seriesOf(user.id);
    expect(again).toMatchObject({ status: "confirmed", displayName: "Кино по выходным", occurrences: 4 });
  });

  it("детекция пользователя B не трогает серии и операции A", async () => {
    const { user: a, card } = await setup();
    const { user: b, card: cardB } = await setup();
    await monthly(a, { type: "expense", accountId: card, amount: "299", description: "YANDEX PLUS" }, 4);
    await monthly(b, { type: "expense", accountId: cardB, amount: "299", description: "YANDEX PLUS" }, 4);
    await detectForUser(a.id);
    const before = await seriesOf(a.id);
    await detectForUser(b.id);
    const [seriesB] = await seriesOf(b.id);
    // операции A не попали в расчёт B: иначе списания в те же дни сложились бы в 598 ₽
    expect(seriesB).toMatchObject({ amountLast: "299.00", occurrences: 4 });
    expect(await seriesOf(a.id)).toEqual(before);
    const linkedToB = await db.select().from(transactions).where(eq(transactions.recurringSeriesId, seriesB.id));
    expect(linkedToB.every((row) => row.userId === b.id)).toBe(true);
    expect(linkedToB).toHaveLength(4);
  });

  it("задача recurring.detect — ночью в 03:00 и для одного пользователя по userId", async () => {
    const job = jobDefinitions.find((item) => item.name === "recurring.detect")!;
    expect(job.cron).toBe("0 3 * * *");
    const { user, card } = await setup();
    await monthly(user, { type: "expense", accountId: card, amount: "550", description: "MTS" }, 4);
    await job.handler({ userId: user.id });
    expect(await seriesOf(user.id)).toMatchObject([{ kind: "utility" }]);
  });
});
