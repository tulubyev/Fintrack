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

  const goal = await asA("post", "/api/v1/goals").send({ name: "Отпуск", targetAmount: "100000", initialAmount: "2500" });
  expect(goal.status).toBe(201);
  goalId = goal.body.id;

  const budget = await asA("post", "/api/v1/budgets").send({ categoryId: null, amount: "30000" });
  expect(budget.status).toBe(201);
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
    expect((await asA("get", "/api/v1/dashboard/summary")).body.balance.totalRub).toBe("12345.67");
    const res = await asB("get", "/api/v1/dashboard/summary");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ balance: { totalRub: "0.00" }, period: { expense: "0.00" }, goals: [] });
  });
});

describe("цели и бюджеты", () => {
  it("B не видит цели A", async () => {
    expect(ids((await asA("get", "/api/v1/goals")).body.items)).toContain(goalId);
    const res = await asB("get", "/api/v1/goals");
    expect(res.status).toBe(200);
    expect(ids(res.body.items)).not.toContain(goalId);
  });

  it("B не меняет цель A", async () => {
    const res = await asB("patch", `/api/v1/goals/${goalId}`).send({ name: "Взлом", targetAmount: "1" });
    expect(res.status).toBe(404);
    const goal = (await asA("get", `/api/v1/goals/${goalId}`)).body;
    expect(goal).toMatchObject({ name: "Отпуск", targetAmount: "100000.00", currentAmount: "2500.00" });
  });

  it("B не видит бюджеты A", async () => {
    expect(ids((await asA("get", "/api/v1/budgets")).body.items)).toContain(budgetId);
    const res = await asB("get", "/api/v1/budgets");
    expect(res.status).toBe(200);
    expect(ids(res.body.items)).not.toContain(budgetId);
  });

  it("B не меняет и не удаляет бюджет A", async () => {
    expect((await asB("patch", `/api/v1/budgets/${budgetId}`).send({ amount: "1" })).status).toBe(404);
    expect((await asB("delete", `/api/v1/budgets/${budgetId}`)).status).toBe(404);
    const item = (await asA("get", "/api/v1/budgets")).body.items.find((x: { id: string }) => x.id === budgetId);
    expect(item.amount).toBe("30000.00");
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
