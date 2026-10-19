/**
 * Без токена — 401, обычному пользователю админские маршруты закрыты — 403.
 */
import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app, auth, makeAdmin, registerUser, type TestUser } from "./helpers";

const ID = "00000000-0000-0000-0000-000000000000";

// Все маршруты с данными пользователя
const protectedRoutes: Array<[method: "get" | "post" | "put" | "patch" | "delete", url: string]> = [
  ["get", "/api/accounts"],
  ["get", "/api/v1/categories"],
  ["get", "/api/v1/accounts"],
  ["post", "/api/v1/accounts"],
  ["get", "/api/v1/institutions"],
  ["get", "/api/v1/transactions"],
  ["post", "/api/v1/transactions"],
  ["get", "/api/v1/transactions/summary"],
  ["post", "/api/v1/transfers"],
  ["get", "/api/v1/transfers/suggestions"],
  ["get", "/api/transactions"],
  ["get", "/api/dashboard/stats"],
  ["get", "/api/savings-goals"],
  ["post", "/api/savings-goals"],
  ["patch", `/api/savings-goals/${ID}`],
  ["get", "/api/v1/budgets"],
  ["post", "/api/v1/budgets"],
  ["get", "/api/v1/budgets/suggestions"],
  ["post", "/api/v1/budgets/bulk"],
  ["patch", `/api/v1/budgets/${ID}`],
  ["delete", `/api/v1/budgets/${ID}`],
  ["get", `/api/v1/budgets/${ID}/daily`],
  ["get", "/api/documents"],
  ["get", "/api/documents/types"],
  ["post", "/api/documents/upload"],
  ["get", `/api/documents/${ID}/download`],
  ["get", `/api/documents/${ID}/history`],
  ["post", `/api/documents/${ID}/view-token`],
  ["delete", `/api/documents/${ID}`],
  ["put", "/api/profile/update"],
  ["post", "/api/profile/upload-image"],
  ["get", "/api/ai/chat/sessions"],
  ["post", "/api/ai/chat/session"],
  ["post", "/api/ai/chat/message"],
  ["get", "/api/ai/insights"],
  ["get", "/api/auth/sessions"],
  ["delete", `/api/auth/sessions/${ID}`],
  ["post", "/api/auth/logout-all"],
  ["get", "/api/auth/verify"],
  ["post", "/api/auth/2fa/setup"],
  ["get", "/api/auth/2fa/status"],
];

// Маршруты только для администраторов
const adminRoutes: Array<[method: "get" | "put" | "patch", url: string]> = [
  ["get", "/api/admin/users"],
  ["get", `/api/admin/users/${ID}`],
  ["patch", `/api/admin/users/${ID}`],
  ["patch", `/api/admin/users/${ID}/role`],
  ["get", "/api/admin/roles"],
  ["get", "/api/admin/profile"],
  ["get", "/api/admin/documents/pending"],
  ["get", "/api/admin/documents/archived"],
  ["get", "/api/admin/dashboard/metrics"],
  ["get", "/api/admin/users/analytics"],
  ["get", "/api/admin/finances/overview"],
  ["get", "/api/admin/security/overview"],
  ["get", "/api/admin/system/info"],
  ["get", "/api/admin/logs"],
  ["put", `/api/documents/${ID}/status`],
  ["get", "/api/ai/balance"],
];

describe("без токена", () => {
  it.each(protectedRoutes)("%s %s → 401", async (method, url) => {
    expect((await request(app)[method](url)).status).toBe(401);
  });

  it.each(adminRoutes)("%s %s → 401", async (method, url) => {
    expect((await request(app)[method](url)).status).toBe(401);
  });
});

describe("обычный пользователь", () => {
  let user: TestUser;
  beforeAll(async () => {
    user = await registerUser();
  });

  it.each(adminRoutes)("%s %s → 403", async (method, url) => {
    expect((await request(app)[method](url).set(auth(user.token)).send({ adminRole: "super_admin" })).status).toBe(403);
  });

  it("не назначает себе роль администратора", async () => {
    await request(app).patch(`/api/admin/users/${user.id}/role`).set(auth(user.token)).send({ adminRole: "super_admin" });
    expect((await request(app).get("/api/admin/users").set(auth(user.token))).status).toBe(403);
  });
});

describe("администратор с узкой ролью", () => {
  it("analytics_admin не меняет роли пользователей", async () => {
    const [analyst, target] = [await registerUser(), await registerUser()];
    await makeAdmin(analyst, "analytics_admin");
    const res = await request(app).patch(`/api/admin/users/${target.id}/role`).set(auth(analyst.token)).send({ adminRole: "super_admin" });
    expect(res.status).toBe(403);
  });
});
