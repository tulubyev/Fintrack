/**
 * Цели v2 (E1.4-T5): взносы, привязка к счёту и перенос остатка при отвязке, прогноз даты и нужный взнос
 * (растёт, стоит, падает), достижение с одним уведомлением, архив, права.
 */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { and, eq } from "drizzle-orm";
import { db, goalContributions, notifications, savingsGoals } from "@workspace/db";
import { addMonths, forecast, monthsUntil, todayMsk } from "../src/services/goalService";
import { app, auth, registerUser, type TestUser } from "./helpers";

const as = (user: TestUser) => ({
  get: (url: string) => request(app).get(url).set(auth(user.token)),
  post: (url: string, body?: object) => request(app).post(url).set(auth(user.token)).send(body ?? {}),
  patch: (url: string, body: object) => request(app).patch(url).set(auth(user.token)).send(body),
  delete: (url: string) => request(app).delete(url).set(auth(user.token)),
});

const TODAY = todayMsk();
const daysAgo = (days: number) => {
  const date = new Date(`${TODAY}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
};
const rub = (value: number) => BigInt(value) * 100n;

async function goal(user: TestUser, body: Record<string, unknown>) {
  const res = await as(user).post("/api/v1/goals", { name: "Отпуск", targetAmount: "150000", ...body });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body;
}

async function contribute(user: TestUser, goalId: string, body: Record<string, unknown>) {
  const res = await as(user).post(`/api/v1/goals/${goalId}/contributions`, body);
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body;
}

describe("прогноз и нужный взнос", () => {
  const base = { target: rub(150_000), current: rub(45_000), targetDate: "2027-04-19", today: "2026-10-19" };

  it("растёт: 15 000 в месяц → через 7 месяцев, к сроку через 6 — не успевает, нужно 17 500 в месяц", () => {
    expect(forecast({ ...base, growth: rub(15_000) })).toEqual({ forecastDate: "2027-05-19", monthlyNeeded: rub(17_500), onTrack: false });
    expect(forecast({ ...base, growth: rub(21_000) })).toMatchObject({ forecastDate: "2027-03-19", onTrack: true });
  });

  it("стоит и падает: прогноза нет, к сроку не успевает", () => {
    expect(forecast({ ...base, growth: 0n })).toEqual({ forecastDate: null, monthlyNeeded: rub(17_500), onTrack: false });
    expect(forecast({ ...base, growth: -rub(3_000) })).toEqual({ forecastDate: null, monthlyNeeded: rub(17_500), onTrack: false });
  });

  it("без срока onTrack — null; достигнута — true без взноса; взнос до рубля вверх; минимум один месяц", () => {
    expect(forecast({ ...base, targetDate: null, growth: rub(1) })).toMatchObject({ monthlyNeeded: null, onTrack: null });
    expect(forecast({ ...base, current: rub(150_000), growth: 0n })).toEqual({ forecastDate: null, monthlyNeeded: null, onTrack: true });
    expect(forecast({ ...base, current: 0n, target: 100n * 100n + 1n, targetDate: "2026-11-19", growth: 0n }).monthlyNeeded).toBe(rub(101));
    expect(monthsUntil("2026-10-19", "2026-10-25")).toBe(1);
    expect(monthsUntil("2026-10-19", "2027-04-18")).toBe(5);
    expect(addMonths("2027-01-31", 1)).toBe("2027-02-28");
  });
});

describe("цель со взносами", () => {
  it("начальная сумма, взносы за 90 дней дают прирост, старые — нет; прогноз и история с курсором", async () => {
    const user = await registerUser();
    const created = await goal(user, { initialAmount: "10000", targetDate: addMonths(TODAY, 12) });
    expect(created).toMatchObject({ currentAmount: "10000.00", percent: 6, accountId: null, avgMonthlyGrowth: "3333.33" });

    await contribute(user, created.id, { amount: "5000", date: daysAgo(120), note: "давно" });
    await contribute(user, created.id, { amount: "20000", date: daysAgo(30) });
    const { goal: after } = await contribute(user, created.id, { amount: "-3000", date: TODAY, note: "сняла на подарок" });
    // 10 000 + 5 000 + 20 000 − 3 000; прирост за 90 дней: (10 000 + 20 000 − 3 000) / 3
    expect(after).toMatchObject({ currentAmount: "32000.00", avgMonthlyGrowth: "9000.00", forecastDate: addMonths(TODAY, 14), onTrack: false });
    expect(after.monthlyNeeded).toBe("9834.00"); // 118 000 / 12 вверх до рубля

    const first = await as(user).get(`/api/v1/goals/${created.id}/contributions?limit=2`);
    expect(first.body.items.map((c: { amount: string }) => c.amount)).toEqual(["-3000.00", "10000.00"]);
    const second = await as(user).get(`/api/v1/goals/${created.id}/contributions?limit=2&cursor=${first.body.nextCursor}`);
    expect(second.body.items.map((c: { amount: string }) => c.amount)).toEqual(["20000.00", "5000.00"]);
    expect(second.body.nextCursor).toBeNull();

    expect((await as(user).get("/api/v1/dashboard/summary")).body.goals[0].currentAmount).toBe("32000.00");
  });

  it("нельзя снять больше накопленного и удалить взнос, без которого сумма уйдёт в минус", async () => {
    const user = await registerUser();
    const created = await goal(user, {});
    const { contribution } = await contribute(user, created.id, { amount: "1000" });
    expect((await as(user).post(`/api/v1/goals/${created.id}/contributions`, { amount: "-1500" })).status).toBe(409);
    await contribute(user, created.id, { amount: "-600" });
    expect((await as(user).delete(`/api/v1/goals/${created.id}/contributions/${contribution.id}`)).status).toBe(409);
    expect((await as(user).get(`/api/v1/goals/${created.id}`)).body.currentAmount).toBe("400.00");
  });

  it("достижение: completedAt и одно уведомление со ссылкой на /goals", async () => {
    const user = await registerUser();
    const created = await goal(user, { targetAmount: "5000" });
    const { goal: reached } = await contribute(user, created.id, { amount: "5000" });
    expect(reached.completedAt).not.toBeNull();
    expect(reached.onTrack).toBe(true);
    await contribute(user, created.id, { amount: "100" });
    await as(user).get("/api/v1/goals");
    const sent = await db.select().from(notifications).where(and(eq(notifications.userId, user.id), eq(notifications.type, "goal_reached")));
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ title: "Цель «Отпуск» достигнута", deepLink: "/goals", dedupKey: `goal:${created.id}:reached` });

    // подняли цель выше суммы — снова в процессе
    const raised = await as(user).patch(`/api/v1/goals/${created.id}`, { targetAmount: "10000" });
    expect(raised.body).toMatchObject({ completedAt: null, percent: 51 });
  });

  it("архив и удаление", async () => {
    const user = await registerUser();
    const created = await goal(user, {});
    expect((await as(user).post(`/api/v1/goals/${created.id}/archive`)).body.archivedAt).not.toBeNull();
    expect((await as(user).get("/api/v1/goals")).body.items).toEqual([]);
    expect((await as(user).get("/api/v1/goals?includeArchived=true")).body.items).toHaveLength(1);
    expect((await as(user).post(`/api/v1/goals/${created.id}/contributions`, { amount: "100" })).status).toBe(409);
    expect((await as(user).post(`/api/v1/goals/${created.id}/unarchive`)).body.archivedAt).toBeNull();
    expect((await as(user).delete(`/api/v1/goals/${created.id}`)).status).toBe(204);
    expect((await as(user).get(`/api/v1/goals/${created.id}`)).status).toBe(404);
  });

  it("валидация и идемпотентное создание", async () => {
    const user = await registerUser();
    expect((await as(user).post("/api/v1/goals", { name: "", targetAmount: "100" })).status).toBe(400);
    expect((await as(user).post("/api/v1/goals", { name: "А", targetAmount: "0" })).status).toBe(400);
    expect((await as(user).post("/api/v1/goals", { name: "А", targetAmount: "100", targetDate: daysAgo(1) })).status).toBe(400);
    expect((await as(user).post("/api/v1/goals", { name: "А", targetAmount: "100", color: "red" })).status).toBe(400);
    const created = await goal(user, {});
    expect((await as(user).post(`/api/v1/goals/${created.id}/contributions`, { amount: "0" })).status).toBe(400);
    expect((await as(user).post(`/api/v1/goals/${created.id}/contributions`, { amount: "10", date: addMonths(TODAY, 1) })).status).toBe(400);

    const id = randomUUID();
    expect((await as(user).post("/api/v1/goals", { id, name: "Машина", targetAmount: "900000" })).status).toBe(201);
    expect((await as(user).post("/api/v1/goals", { id, name: "Машина", targetAmount: "900000" })).status).toBe(200);
    expect((await as(user).get("/api/v1/goals")).body.items).toHaveLength(2);

    expect((await as(user).get("/api/savings-goals")).status).toBe(404);
  });
});

describe("цель, привязанная к счёту", () => {
  it("«только новые деньги»: сумма — прирост остатка; взносы вручную — 409; при отвязке остаток фиксируется взносом", async () => {
    const user = await registerUser();
    const acc = await as(user).post("/api/v1/accounts", { name: "Накопительный", kind: "savings", openingBalance: "100000.00", openingBalanceDate: daysAgo(200) });
    expect(acc.status).toBe(201);
    const created = await goal(user, { accountId: acc.body.id, countOnlyNewMoney: true, targetAmount: "60000", targetDate: addMonths(TODAY, 6) });
    expect(created).toMatchObject({ accountId: acc.body.id, countOnlyNewMoney: true, currentAmount: "0.00" });

    const income = await as(user).post("/api/v1/transactions", { type: "income", accountId: acc.body.id, amount: "30000", date: daysAgo(10) });
    expect(income.status).toBe(201);
    const linked = (await as(user).get(`/api/v1/goals/${created.id}`)).body;
    expect(linked).toMatchObject({ currentAmount: "30000.00", percent: 50, avgMonthlyGrowth: "10000.00", forecastDate: addMonths(TODAY, 3), onTrack: true });

    expect((await as(user).post(`/api/v1/goals/${created.id}/contributions`, { amount: "100" })).status).toBe(409);
    expect((await as(user).post("/api/v1/goals", { name: "Б", targetAmount: "1", accountId: acc.body.id, initialAmount: "5" })).status).toBe(400);

    // весь остаток вместо новых денег
    expect((await as(user).patch(`/api/v1/goals/${created.id}`, { countOnlyNewMoney: false })).body.currentAmount).toBe("130000.00");

    const unlinked = await as(user).patch(`/api/v1/goals/${created.id}`, { accountId: null });
    expect(unlinked.body).toMatchObject({ accountId: null, currentAmount: "130000.00" });
    const history = (await as(user).get(`/api/v1/goals/${created.id}/contributions`)).body.items;
    expect(history).toMatchObject([{ amount: "130000.00", note: "Перенос остатка" }]);
  });

  it("кредит, валютный и чужой счёт не привязываются", async () => {
    const user = await registerUser();
    const other = await registerUser();
    const loan = await as(user).post("/api/v1/accounts", { name: "Ипотека", kind: "loan", openingBalance: "-100000.00" });
    const usd = await as(user).post("/api/v1/accounts", { name: "Доллары", kind: "savings", currency: "USD" });
    const foreign = await as(other).post("/api/v1/accounts", { name: "Чужой", kind: "savings" });
    for (const [accountId, status] of [[loan.body.id, 400], [usd.body.id, 400], [foreign.body.id, 404]] as const) {
      expect((await as(user).post("/api/v1/goals", { name: "Х", targetAmount: "1000", accountId })).status).toBe(status);
    }
  });
});

describe("права: B не видит и не меняет цели A", () => {
  it("все операции с чужой целью и её взносами — 404, цель A не изменилась", async () => {
    const a = await registerUser();
    const b = await registerUser();
    const created = await goal(a, { initialAmount: "2500" });
    const { contribution } = await contribute(a, created.id, { amount: "500" });
    const url = `/api/v1/goals/${created.id}`;

    expect((await as(b).get("/api/v1/goals?includeArchived=true")).body.items).toEqual([]);
    expect((await as(b).get(url)).status).toBe(404);
    expect((await as(b).patch(url, { name: "Взлом", targetAmount: "1" })).status).toBe(404);
    expect((await as(b).post(`${url}/archive`)).status).toBe(404);
    expect((await as(b).post(`${url}/unarchive`)).status).toBe(404);
    expect((await as(b).get(`${url}/contributions`)).status).toBe(404);
    expect((await as(b).post(`${url}/contributions`, { amount: "-3000" })).status).toBe(404);
    expect((await as(b).delete(`${url}/contributions/${contribution.id}`)).status).toBe(404);
    expect((await as(b).delete(url)).status).toBe(404);
    expect((await as(b).post("/api/v1/goals", { id: created.id, name: "Х", targetAmount: "1" })).status).toBe(409);

    // взнос B со ссылкой на операцию A
    const own = await goal(b, {});
    const accA = await as(a).post("/api/v1/accounts", { name: "Карта", kind: "debit_card", openingBalance: "1000.00" });
    const txA = await as(a).post("/api/v1/transactions", { type: "expense", accountId: accA.body.id, amount: "100", date: TODAY });
    expect((await as(b).post(`/api/v1/goals/${own.id}/contributions`, { amount: "100", transactionId: txA.body.id })).status).toBe(404);

    const [row] = await db.select().from(savingsGoals).where(eq(savingsGoals.id, created.id));
    expect(row).toMatchObject({ name: "Отпуск", targetAmount: "150000.00", currentAmount: "3000.00", deletedAt: null, archivedAt: null });
    expect(await db.select().from(goalContributions).where(eq(goalContributions.goalId, created.id))).toHaveLength(2);
  });
});
