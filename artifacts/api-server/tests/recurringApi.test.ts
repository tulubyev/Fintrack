/**
 * API регулярных платежей (E1.6-T3): список с итогами и пересечениями, фильтры, ближайшие списания, карточка,
 * статусы, ручная серия, ограничение ручного перезапуска, права.
 */
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { db, categories, recurringSeries } from "@workspace/db";
import { addDays, addMonths } from "../src/services/recurring/detector";
import { detectForUser, todayMsk } from "../src/services/recurring/recurringService";
import { app, auth, registerUser, type TestUser } from "./helpers";

const TODAY = todayMsk();
const as = (user: TestUser) => ({
  get: (url: string) => request(app).get(url).set(auth(user.token)),
  post: (url: string, body?: object) => request(app).post(url).set(auth(user.token)).send(body ?? {}),
  patch: (url: string, body: object) => request(app).patch(url).set(auth(user.token)).send(body),
});

async function setup() {
  const user = await registerUser();
  const acc = await as(user).post("/api/v1/accounts", { name: `Карта ${randomUUID().slice(0, 6)}`, kind: "debit_card", openingBalance: "900000.00", openingBalanceDate: addDays(TODAY, -400) });
  return { user, card: acc.body.id as string };
}

async function monthly(user: TestUser, body: Record<string, unknown>, n: number, last: string) {
  const ids: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const res = await as(user).post("/api/v1/transactions", { ...body, date: addMonths(last, -i) });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    ids.push(res.body.id);
  }
  return ids;
}

let a: TestUser;
let card: string;
let byName: Record<string, any>;

beforeAll(async () => {
  ({ user: a, card } = await setup());
  const recent = addDays(TODAY, -3);
  await monthly(a, { type: "expense", accountId: card, amount: "299", description: "YANDEX PLUS" }, 5, recent);
  await monthly(a, { type: "expense", accountId: card, amount: "399", description: "OKKO" }, 4, addDays(TODAY, -5));
  await monthly(a, { type: "expense", accountId: card, amount: "299", description: "KINOPOISK" }, 4, addDays(TODAY, -7));
  await monthly(a, { type: "expense", accountId: card, amount: "550", description: "MTS" }, 4, addDays(TODAY, -9));
  await monthly(a, { type: "income", accountId: card, amount: "120000", description: "Заработная плата" }, 4, addDays(TODAY, -10));
  await detectForUser(a.id);
  const list = await as(a).get("/api/v1/recurring");
  byName = Object.fromEntries(list.body.items.map((item: { displayName: string }) => [item.displayName, item]));
});

describe("GET /api/v1/recurring", () => {
  it("итоги подписок, обязательных и доходов; пересечения сервисов; сервис с инструкцией", async () => {
    const res = await as(a).get("/api/v1/recurring");
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(5);
    // подписки: 299 + 399 + 299 = 997 ₽ в месяц, × 12 = 11 964 ₽
    expect(res.body.totals).toMatchObject({ monthly: "997.00", yearly: "11964.00", count: 3, mandatoryMonthly: "550.00", incomeMonthly: "120000.00", newCount: 5 });
    const groups = res.body.overlaps.map((o: { group: string }) => o.group).sort();
    expect(groups).toEqual(["video", "yandex_plus"]);
    expect(res.body.overlaps.find((o: { group: string }) => o.group === "video").seriesIds.sort()).toEqual([byName.Okko.id, byName["Кинопоиск"].id].sort());
    expect(byName.Okko.overlapGroup).toBe("video");
    expect(byName["Яндекс Плюс"]).toMatchObject({
      kind: "subscription", periodicity: "monthly", monthlyEquivalent: "299.00", yearlyEquivalent: "3588.00", status: "detected",
      service: { code: "yandex_plus", group: "bundle", verified: false },
    });
    expect(byName["Яндекс Плюс"].service.cancelSteps).toBeTruthy();
  });

  it("фильтры по виду и направлению; неизвестный вид — 400", async () => {
    expect((await as(a).get("/api/v1/recurring?kind=utility")).body.items.map((i: { displayName: string }) => i.displayName)).toEqual(["МТС"]);
    expect((await as(a).get("/api/v1/recurring?direction=in")).body.items).toMatchObject([{ kind: "salary" }]);
    expect((await as(a).get("/api/v1/recurring?kind=magic")).status).toBe(400);
  });
});

describe("GET /api/v1/recurring/upcoming", () => {
  it("списания в окне по датам, итог только расходов в рублях", async () => {
    const res = await as(a).get("/api/v1/recurring/upcoming?days=40");
    expect(res.status).toBe(200);
    const plus = res.body.items.find((item: { seriesId: string }) => item.seriesId === byName["Яндекс Плюс"].id);
    expect(plus).toMatchObject({ date: addMonths(addDays(TODAY, -3), 1), amount: "299.00" });
    expect(res.body.items.map((i: { date: string }) => i.date)).toEqual([...res.body.items.map((i: { date: string }) => i.date)].sort());
    expect(res.body.total).toBe("1547.00"); // 299 + 399 + 299 + 550, зарплата не входит
    expect((await as(a).get("/api/v1/recurring/upcoming?days=0")).status).toBe(400);
  });
});

describe("карточка и статусы", () => {
  it("карточка с последними списаниями", async () => {
    const res = await as(a).get(`/api/v1/recurring/${byName["Яндекс Плюс"].id}`);
    expect(res.status).toBe(200);
    expect(res.body.transactions).toHaveLength(5);
    expect(res.body.transactions[0].date >= res.body.transactions[4].date).toBe(true);
  });

  it("подтвердить, «это не подписка», отменить; напоминание 0–7; чужая категория — 404; закончившийся — только подтвердить", async () => {
    const plus = byName["Яндекс Плюс"].id;
    expect((await as(a).patch(`/api/v1/recurring/${plus}`, { status: "confirmed", remindDaysBefore: 3 })).body).toMatchObject({ status: "confirmed", remindDaysBefore: 3 });
    expect((await as(a).patch(`/api/v1/recurring/${plus}`, { remindDaysBefore: 8 })).status).toBe(400);

    const okko = byName.Okko.id;
    const cancelled = await as(a).patch(`/api/v1/recurring/${okko}`, { status: "cancelled" });
    expect(cancelled.body.status).toBe("cancelled");
    expect(cancelled.body.cancelledAt).not.toBeNull();

    const mts = byName["МТС"].id;
    await as(a).patch(`/api/v1/recurring/${mts}`, { status: "ignored" });
    const list = await as(a).get("/api/v1/recurring");
    expect(list.body.items.map((i: { id: string }) => i.id)).not.toContain(mts);
    expect(list.body.items.map((i: { id: string }) => i.id)).not.toContain(okko);
    expect((await as(a).get("/api/v1/recurring?status=cancelled,ignored")).body.items).toHaveLength(2);
    // отменённый Okko больше не пересекается с Кинопоиском
    expect(list.body.overlaps.map((o: { group: string }) => o.group)).toEqual(["yandex_plus"]);

    const { user: other } = await setup();
    const [foreign] = await db.insert(categories).values({ userId: other.id, name: `Чужая ${randomUUID().slice(0, 6)}`, kind: "expense" }).returning();
    expect((await as(a).patch(`/api/v1/recurring/${plus}`, { categoryId: foreign.id })).status).toBe(404);

    const kp = byName["Кинопоиск"].id;
    await db.update(recurringSeries).set({ status: "ended" }).where(eq(recurringSeries.id, kp));
    expect((await as(a).patch(`/api/v1/recurring/${kp}`, { status: "ignored" })).status).toBe(400);
    expect((await as(a).patch(`/api/v1/recurring/${kp}`, { status: "confirmed" })).body.status).toBe("confirmed");
  });
});

describe("POST /api/v1/recurring — ручная серия", () => {
  it("из выбранных операций: подтверждена, периодичность по интервалам, операции привязаны; ошибки ввода", async () => {
    const { user, card: acc } = await setup();
    const ids = await monthly(user, { type: "expense", accountId: acc, amount: "4000", description: "Секция бокса" }, 3, addDays(TODAY, -4));
    const res = await as(user).post("/api/v1/recurring", { transactionIds: ids, displayName: "Бокс для сына" });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body).toMatchObject({ displayName: "Бокс для сына", status: "confirmed", source: "manual", periodicity: "monthly", amountLast: "4000.00", occurrences: 3 });
    expect(res.body.transactions).toHaveLength(3);

    // нерегулярные интервалы 60 и 28 дней — медиана 44, ближе всего «каждый месяц»
    const uneven = [];
    for (const back of [100, 40, 12]) {
      uneven.push((await as(user).post("/api/v1/transactions", { type: "expense", accountId: acc, amount: "1500", description: "Репетитор", date: addDays(TODAY, -back) })).body.id);
    }
    expect((await as(user).post("/api/v1/recurring", { transactionIds: uneven })).body.periodicity).toBe("monthly");

    const income = await as(user).post("/api/v1/transactions", { type: "income", accountId: acc, amount: "100", description: "Возврат", date: TODAY });
    expect((await as(user).post("/api/v1/recurring", { transactionIds: [ids[0], income.body.id] })).status).toBe(400);
    expect((await as(user).post("/api/v1/recurring", { transactionIds: [ids[0]] })).status).toBe(400);
    const sameDay = await as(user).post("/api/v1/transactions", { type: "expense", accountId: acc, amount: "4000", description: "Секция бокса", date: addDays(TODAY, -4) });
    expect((await as(user).post("/api/v1/recurring", { transactionIds: [ids[2], sameDay.body.id] })).status).toBe(400);
  });
});

describe("POST /api/v1/recurring/detect", () => {
  it("ручной перезапуск — 202, повтор в течение 10 минут — 429", async () => {
    const { user } = await setup();
    expect((await as(user).post("/api/v1/recurring/detect")).status).toBe(202);
    expect((await as(user).post("/api/v1/recurring/detect")).status).toBe(429);
  });
});

describe("права: B не видит и не меняет регулярные платежи A", () => {
  it("список пуст, карточка и правка — 404, ручная серия из операций A — 404", async () => {
    const { user: b } = await setup();
    const id = byName["Яндекс Плюс"].id;
    expect((await as(b).get("/api/v1/recurring?status=detected,confirmed,ignored,cancelled,ended")).body.items).toEqual([]);
    expect((await as(b).get("/api/v1/recurring/upcoming?days=90")).body.items).toEqual([]);
    expect((await as(b).get(`/api/v1/recurring/${id}`)).status).toBe(404);
    expect((await as(b).patch(`/api/v1/recurring/${id}`, { status: "ignored", displayName: "Взлом" })).status).toBe(404);
    const aTx = (await as(a).get(`/api/v1/recurring/${id}`)).body.transactions.map((t: { id: string }) => t.id);
    expect((await as(b).post("/api/v1/recurring", { transactionIds: aTx.slice(0, 2) })).status).toBe(404);
    const [row] = await db.select().from(recurringSeries).where(eq(recurringSeries.id, id));
    expect(row.displayName).toBe("Яндекс Плюс");
    expect(row.userId).toBe(a.id);
  });
});
