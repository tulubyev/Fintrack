/**
 * Продуктовые события (E1.0-T3): приём пачек, закрытый список, вырезание ПДн, userId только из токена.
 */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { db, productEvents } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { app, auth, registerUser } from "./helpers";
import { jobDefinitions } from "../src/jobs/definitions";

const event = (anonymousId: string, overrides: Record<string, unknown> = {}) => ({
  name: "app_opened",
  occurredAt: new Date().toISOString(),
  anonymousId,
  sessionId: "s-1",
  platform: "web",
  props: { entry: "direct", route: "/" },
  ...overrides,
});

const byAnonymous = (anonymousId: string) =>
  db.select().from(productEvents).where(eq(productEvents.anonymousId, anonymousId));

describe("POST /api/v1/events", () => {
  it("принимает пачку без входа: 202 и записи без пользователя", async () => {
    const anon = randomUUID();
    const res = await request(app).post("/api/v1/events").send({ events: [event(anon), event(anon, { name: "notification_shown", props: { type: "system" } })] });

    expect(res.status).toBe(202);
    expect(res.body).toEqual({ accepted: 2 });
    const rows = await byAnonymous(anon);
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.userId === null && row.platform === "web")).toBe(true);
  });

  it("отбрасывает события не из списка", async () => {
    const anon = randomUUID();
    const res = await request(app).post("/api/v1/events").send({ events: [event(anon), event(anon, { name: "made_up_event" })] });

    expect(res.status).toBe(202);
    expect(res.body.accepted).toBe(1);
    expect((await byAnonymous(anon)).map((row) => row.name)).toEqual(["app_opened"]);
  });

  it("вырезает свойства, похожие на ПДн, и вложенные объекты", async () => {
    const anon = randomUUID();
    await request(app).post("/api/v1/events").send({ events: [event(anon, { props: {
      route: "/budgets",
      count: 3,
      ok: true,
      phone: "+7 (999) 123-45-67",
      phone8: "89991234567",
      email: "ivan@example.ru",
      card: "4276 1234 5678 9012",
      nested: { a: 1 },
    } })] });

    const [row] = await byAnonymous(anon);
    expect(row.props).toEqual({ route: "/budgets", count: 3, ok: true });
  });

  it("с токеном пишет пользователя из токена, а не из тела", async () => {
    const [user, other] = [await registerUser(), await registerUser()];
    const anon = randomUUID();
    const res = await request(app).post("/api/v1/events").set(auth(user.token))
      .send({ userId: other.id, events: [event(anon, { userId: other.id })] });

    expect(res.status).toBe(202);
    const [row] = await byAnonymous(anon);
    expect(row.userId).toBe(user.id);
  });

  it("с недействительным токеном записывает событие как анонимное", async () => {
    const anon = randomUUID();
    const res = await request(app).post("/api/v1/events").set(auth("not-a-token")).send({ events: [event(anon)] });

    expect(res.status).toBe(202);
    expect((await byAnonymous(anon))[0].userId).toBeNull();
  });

  it("время из будущего заменяет текущим", async () => {
    const anon = randomUUID();
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await request(app).post("/api/v1/events").send({ events: [event(anon, { occurredAt: future })] });

    const [row] = await byAnonymous(anon);
    expect(row.occurredAt.getTime()).toBeLessThan(Date.now() + 60_000);
  });

  it.each([
    ["пустая пачка", { events: [] }],
    ["больше 50 событий", { events: Array.from({ length: 51 }, () => event(randomUUID())) }],
    ["клиент выдаёт себя за сервер", { events: [event(randomUUID(), { platform: "server" })] }],
    ["нет времени события", { events: [event(randomUUID(), { occurredAt: undefined })] }],
  ])("%s → 400 VALIDATION_ERROR", async (_title, body) => {
    const res = await request(app).post("/api/v1/events").send(body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("серверные события", () => {
  it("регистрация и вход пишут auth_signed_up и auth_logged_in с anonymous_id", async () => {
    const anon = randomUUID();
    const phone = `+79${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`;
    const password = "Test-Passw0rd!";
    const signup = await request(app).post("/api/auth/register")
      .send({ phone, password, firstName: "Тест", lastName: "События", anonymousId: anon });
    expect(signup.status).toBe(200);
    const login = await request(app).post("/api/auth/login").send({ phone, password, anonymousId: anon });
    expect(login.status).toBe(200);

    // track() пишет без ожидания ответа — даём ему завершиться
    await new Promise((resolve) => setTimeout(resolve, 300));
    const rows = await byAnonymous(anon);
    const names = rows.map((row) => row.name).sort();
    expect(names).toEqual(["auth_logged_in", "auth_signed_up"]);
    expect(rows.every((row) => row.userId === signup.body.user.id && row.platform === "server")).toBe(true);
    expect(rows.find((row) => row.name === "auth_logged_in")!.props).toEqual({ method: "phone", anonymous_id: anon });
  });
});

describe("cleanup.events", () => {
  it("удаляет события старше 400 дней и оставляет остальные", async () => {
    const day = 24 * 60 * 60 * 1000;
    const anon = randomUUID();
    const rows = await db.insert(productEvents).values([
      { anonymousId: anon, name: "app_opened", platform: "web", occurredAt: new Date(Date.now() - 401 * day) },
      { anonymousId: anon, name: "app_opened", platform: "web", occurredAt: new Date(Date.now() - 399 * day) },
    ]).returning({ id: productEvents.id });

    await jobDefinitions.find((job) => job.name === "cleanup.events")!.handler({});

    const left = await db.select({ id: productEvents.id }).from(productEvents).where(inArray(productEvents.id, rows.map((r) => r.id)));
    expect(left.map((r) => r.id)).toEqual([rows[1].id]);
  });
});
