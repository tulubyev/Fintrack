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

describe("события публичного сайта (E1.8-T7)", () => {
  const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
  const siteEvents = (name: string, marker: string) =>
    db.select().from(productEvents).where(eq(productEvents.name, name)).then((rows) => rows.filter((row) => JSON.stringify(row.props).includes(marker)));

  it("пиксель: GIF без cookie и кеша, событие site_page_viewed без пользователя и IP", async () => {
    const marker = `/banks/t${Date.now()}`;
    const res = await request(app).get(`/api/v1/events/site.gif?p=${encodeURIComponent(marker)}`).set("User-Agent", UA);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("image/gif");
    expect(res.headers["cache-control"]).toContain("no-store");
    expect(res.headers["set-cookie"]).toBeUndefined();
    const rows = await siteEvents("site_page_viewed", marker);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ platform: "site", userId: null, anonymousId: null, sessionId: null, props: { path: marker } });
  });

  it("пиксель: бот, пустой User-Agent и чужой путь не пишутся, но картинка отдаётся", async () => {
    const marker = `/help${Date.now()}`;
    const bot = await request(app).get(`/api/v1/events/site.gif?p=${marker}`).set("User-Agent", "Mozilla/5.0 (compatible; YandexBot/3.0)");
    const noUa = await request(app).get(`/api/v1/events/site.gif?p=${marker}`).set("User-Agent", "");
    const bad = await request(app).get(`/api/v1/events/site.gif?p=${encodeURIComponent(`https://evil.example${marker}`)}`).set("User-Agent", UA);
    const junk = await request(app).get(`/api/v1/events/site.gif?p=${encodeURIComponent(`${marker}?email=ivan@example.ru`)}`).set("User-Agent", UA);

    for (const res of [bot, noUa, bad, junk]) expect(res.status).toBe(200);
    expect(await siteEvents("site_page_viewed", marker)).toHaveLength(0);
  });

  it("ping: клик по кнопке → site_cta_clicked с путём из Ping-From; 204 без тела", async () => {
    const cta = `hero-start-${Date.now()}`;
    const res = await request(app)
      .post(`/api/v1/events/site-cta?cta=${cta}`)
      .set("User-Agent", UA)
      .set("Content-Type", "text/ping")
      .set("Ping-From", "https://fin-wall.ru/banks/tbank")
      .set("Ping-To", "https://app.fin-wall.ru/import?bank=tbank")
      .send("PING");

    expect(res.status).toBe(204);
    const rows = await siteEvents("site_cta_clicked", cta);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ platform: "site", userId: null, props: { cta, path: "/banks/tbank" } });
  });

  it("ping: неверный код кнопки и бот не пишутся", async () => {
    const stamp = String(Date.now());
    await request(app).post(`/api/v1/events/site-cta?cta=${encodeURIComponent(`Bad Code ${stamp}`)}`).set("User-Agent", UA).send("PING");
    await request(app).post(`/api/v1/events/site-cta?cta=bot-${stamp}`).set("User-Agent", "Googlebot/2.1").send("PING");
    expect(await siteEvents("site_cta_clicked", stamp)).toHaveLength(0);
  });
});
