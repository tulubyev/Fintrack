/**
 * Обновление сессии (POST /api/auth/refresh) с refresh-токеном в теле — так работает приложение (E2.1).
 * Токен меняется при каждом обновлении; заменённый токен в течение минуты получает ту же новую пару
 * (потерянный ответ, параллельная вкладка), позже — сессия отзывается.
 */
import { describe, expect, it } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { db, authSessions } from "@workspace/db";
import { app, auth } from "./helpers";
import { ROTATION_GRACE_MS } from "../src/services/sessionService";

async function login() {
  const phone = `+79${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`;
  const res = await request(app).post("/api/auth/register").send({
    phone, email: `s-${Date.now()}-${Math.random()}@example.test`, password: "Test-Passw0rd!", firstName: "Тест", lastName: "Сессия",
  });
  expect(res.status).toBe(200);
  return { accessToken: res.body.accessToken as string, refreshToken: res.body.refreshToken as string };
}

const refresh = (refreshToken: string) => request(app).post("/api/auth/refresh").send({ refreshToken });
const me = (accessToken: string) => request(app).get("/api/v1/accounts").set(auth(accessToken));

/** Сдвигает время последней замены токена в прошлое — как будто окно уже прошло. */
async function ageRotation(accessToken: string, ms: number) {
  const sessions = await request(app).get("/api/auth/sessions").set(auth(accessToken));
  await db.update(authSessions).set({ rotatedAt: new Date(Date.now() - ms) }).where(eq(authSessions.id, sessions.body[0].id));
}

describe("POST /api/auth/refresh", () => {
  it("меняет refresh-токен и выдаёт рабочий access-токен; в БД токена нет в открытом виде", async () => {
    const first = await login();
    const res = await refresh(first.refreshToken);
    expect(res.status).toBe(200);
    expect(res.body.refreshToken).not.toBe(first.refreshToken);
    expect((await me(res.body.accessToken)).status).toBe(200);

    const rows = await db.select().from(authSessions);
    const dump = JSON.stringify(rows);
    expect(dump).not.toContain(res.body.refreshToken);
    expect(dump).not.toContain(first.refreshToken);
  });

  it("ответ потерялся: старый токен в течение минуты получает ту же новую пару, сессия жива", async () => {
    const first = await login();
    const lost = await refresh(first.refreshToken); // клиент этот ответ не получил
    const again = await refresh(first.refreshToken);
    expect(again.status).toBe(200);
    expect(again.body.refreshToken).toBe(lost.body.refreshToken);
    expect((await me(again.body.accessToken)).status).toBe(200);

    // дальше клиент продолжает с полученным токеном
    const next = await refresh(again.body.refreshToken);
    expect(next.status).toBe(200);
    expect((await me(next.body.accessToken)).status).toBe(200);
  });

  it("два одновременных обновления одним токеном — оба получают одну и ту же пару", async () => {
    const first = await login();
    const [a, b] = await Promise.all([refresh(first.refreshToken), refresh(first.refreshToken)]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(a.body.refreshToken).toBe(b.body.refreshToken);
  });

  it("заменённый токен после окна — кража: 401 и сессия отозвана целиком", async () => {
    const first = await login();
    const second = await refresh(first.refreshToken);
    await ageRotation(second.body.accessToken, ROTATION_GRACE_MS + 1_000);

    expect((await refresh(first.refreshToken)).status).toBe(401);
    expect((await refresh(second.body.refreshToken)).status).toBe(401);
    expect((await me(second.body.accessToken)).status).toBe(401);
  });

  it("токен, заменённый дважды, не открывает свежую пару", async () => {
    const first = await login();
    const second = await refresh(first.refreshToken);
    await refresh(second.body.refreshToken);
    expect((await refresh(first.refreshToken)).status).toBe(401);
  });

  it("после выхода старый токен не работает даже в окне", async () => {
    const first = await login();
    const second = await refresh(first.refreshToken);
    await request(app).post("/api/auth/logout").send({ refreshToken: second.body.refreshToken });
    expect((await refresh(first.refreshToken)).status).toBe(401);
    expect((await refresh(second.body.refreshToken)).status).toBe(401);
  });
});
