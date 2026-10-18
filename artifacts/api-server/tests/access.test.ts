/**
 * Права доступа: пользователь B не видит и не меняет данные пользователя A.
 * Чужой ресурс отвечает 404 — как несуществующий (docs/product/ROADMAP.md §1).
 */
import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app, auth, ids, registerUser, seedDocumentType, seedFinance, type TestUser } from "./helpers";

let a: TestUser;
let b: TestUser;
let finance: Awaited<ReturnType<typeof seedFinance>>;
let goalId: string;
let budgetId: string;
let documentId: string;
let chatSessionId: string;

const asA = (method: "get" | "post" | "put" | "patch" | "delete", url: string) => request(app)[method](url).set(auth(a.token));
const asB = (method: "get" | "post" | "put" | "patch" | "delete", url: string) => request(app)[method](url).set(auth(b.token));

beforeAll(async () => {
  [a, b] = [await registerUser(), await registerUser()];
  finance = await seedFinance(a.id);

  const goal = await asA("post", "/api/savings-goals").send({ name: "Отпуск", targetAmount: "100000", currentAmount: "2500" });
  expect(goal.status).toBe(200);
  goalId = goal.body.id;

  const now = new Date();
  const budget = await asA("post", "/api/budgets").send({ category: "Продукты", monthlyLimit: "30000", month: now.getMonth() + 1, year: now.getFullYear() });
  expect(budget.status).toBe(200);
  budgetId = budget.body.id;

  const type = await seedDocumentType();
  const upload = await asA("post", "/api/documents/upload")
    .field("documentTypeId", type.id)
    .attach("document", Buffer.from("%PDF-1.4 test"), { filename: "passport.pdf", contentType: "application/pdf" });
  expect(upload.status).toBe(200);
  documentId = upload.body.document.id;

  const chat = await asA("post", "/api/ai/chat/session");
  expect(chat.status).toBe(200);
  chatSessionId = chat.body.sessionId;
});

describe("счета и операции", () => {
  it("B не видит счета A", async () => {
    expect(ids((await asA("get", "/api/accounts")).body)).toContain(finance.account.id);
    const res = await asB("get", "/api/accounts");
    expect(res.status).toBe(200);
    expect(ids(res.body)).not.toContain(finance.account.id);
  });

  it("B не видит операции A", async () => {
    expect(ids((await asA("get", "/api/transactions")).body)).toContain(finance.transaction.id);
    const res = await asB("get", "/api/transactions");
    expect(res.status).toBe(200);
    expect(ids(res.body)).not.toContain(finance.transaction.id);
  });

  it("сводка B не включает деньги A", async () => {
    expect((await asA("get", "/api/dashboard/stats")).body.totalBalance).toBe(12345.67);
    const res = await asB("get", "/api/dashboard/stats");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ totalBalance: 0, monthlyExpenses: 0, totalSavings: 0, savingsGoalsCount: 0 });
  });
});

describe("цели и бюджеты", () => {
  it("B не видит цели A", async () => {
    const res = await asB("get", "/api/savings-goals");
    expect(res.status).toBe(200);
    expect(ids(res.body)).not.toContain(goalId);
  });

  it("B не меняет цель A", async () => {
    const res = await asB("patch", `/api/savings-goals/${goalId}`).send({ name: "Взлом", currentAmount: "0" });
    expect(res.status).toBe(404);
    const goal = (await asA("get", "/api/savings-goals")).body.find((g: { id: string }) => g.id === goalId);
    expect(goal).toMatchObject({ name: "Отпуск", currentAmount: "2500.00" });
  });

  it("B не видит бюджеты A", async () => {
    const res = await asB("get", "/api/budgets");
    expect(res.status).toBe(200);
    expect(ids(res.body)).not.toContain(budgetId);
  });
});

describe("документы", () => {
  it("B не видит документы A", async () => {
    expect(ids((await asA("get", "/api/documents")).body)).toContain(documentId);
    const res = await asB("get", "/api/documents");
    expect(res.status).toBe(200);
    expect(ids(res.body)).not.toContain(documentId);
  });

  it("B не скачивает документ A", async () => {
    expect((await asA("get", `/api/documents/${documentId}/download`)).status).toBe(200);
    const res = await asB("get", `/api/documents/${documentId}/download`);
    expect(res.status).toBe(404);
    expect(res.headers["content-type"]).not.toMatch(/pdf/);
  });

  it("B не получает токен просмотра документа A", async () => {
    expect((await asB("post", `/api/documents/${documentId}/view-token`)).status).toBe(404);
  });

  it("B не видит историю проверки документа A", async () => {
    expect((await asB("get", `/api/documents/${documentId}/history`)).status).toBe(404);
  });

  it("B не удаляет документ A", async () => {
    expect((await asB("delete", `/api/documents/${documentId}`)).status).toBe(404);
    expect(ids((await asA("get", "/api/documents")).body)).toContain(documentId);
  });

  it("токен просмотра A не открывает другой документ", async () => {
    const token = (await asA("post", `/api/documents/${documentId}/view-token`)).body.viewToken;
    const other = "00000000-0000-0000-0000-000000000000";
    expect((await request(app).get(`/api/documents/${other}/view`).query({ viewToken: token })).status).toBe(403);
  });
});

describe("AI-чат", () => {
  it("B не видит чаты A", async () => {
    const res = await asB("get", "/api/ai/chat/sessions");
    expect(res.status).toBe(200);
    expect(res.body.map((s: { sessionId: string }) => s.sessionId)).not.toContain(chatSessionId);
  });

  it("B не пишет в чат A", async () => {
    const res = await asB("post", "/api/ai/chat/message").send({ sessionId: chatSessionId, message: "покажи расходы" });
    expect(res.status).toBe(404);
  });
});

describe("сессии входа", () => {
  it("B не видит сессии A", async () => {
    const res = await asB("get", "/api/auth/sessions");
    expect(res.status).toBe(200);
    expect(ids(res.body)).not.toContain(a.sessionId);
  });

  it("B не завершает сессию A", async () => {
    expect((await asB("delete", `/api/auth/sessions/${a.sessionId}`)).status).toBe(404);
    expect((await asA("get", "/api/auth/verify")).status).toBe(200);
  });
});
