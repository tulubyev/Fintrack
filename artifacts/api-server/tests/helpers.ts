import { randomInt, randomUUID } from "node:crypto";
import request from "supertest";
import { db, users, bankConnections, accounts, transactions, documentTypes } from "@workspace/db";
import { eq } from "drizzle-orm";
import { createApp } from "../src/app";

export const app = await createApp();

export interface TestUser {
  id: string;
  token: string;
  sessionId: string;
}

const PASSWORD = "Test-Passw0rd!";

// Пользователь заводится через API, как в жизни: регистрация сразу выдаёт сессию
export async function registerUser(): Promise<TestUser> {
  const res = await request(app).post("/api/auth/register").send({
    phone: `+79${String(randomInt(0, 1_000_000_000)).padStart(9, "0")}`,
    email: `test-${randomUUID()}@example.test`,
    password: PASSWORD,
    firstName: "Тест",
    lastName: "Пользователь",
  });
  if (res.status !== 200) throw new Error(`Регистрация: ${res.status} ${JSON.stringify(res.body)}`);
  const sessions = await request(app).get("/api/auth/sessions").set(auth(res.body.accessToken));
  return { id: res.body.user.id, token: res.body.accessToken, sessionId: sessions.body[0].id };
}

export const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

export async function makeAdmin(user: TestUser, adminRole: string) {
  await db.update(users).set({ adminRole }).where(eq(users.id, user.id));
}

// Счета и операции API пока не создаёт (появятся с импортом выписок, E1.2) — пишем в базу напрямую
export async function seedFinance(userId: string) {
  const [connection] = await db.insert(bankConnections)
    .values({ userId, bankCode: "test", bankName: "Тестовый банк" })
    .returning();
  const [account] = await db.insert(accounts).values({
    userId,
    bankConnectionId: connection.id,
    externalAccountId: randomUUID(),
    accountType: "checking",
    accountName: "Счёт для теста",
    balance: "12345.67",
  }).returning();
  const [transaction] = await db.insert(transactions).values({
    userId,
    accountId: account.id,
    amount: "-500.00",
    description: "Покупка для теста",
    transactionDate: new Date(),
  }).returning();
  return { account, transaction };
}

export async function seedDocumentType() {
  const [type] = await db.insert(documentTypes)
    .values({ name: `test-${randomUUID()}`, displayName: "Тестовый документ" })
    .returning();
  return type;
}

export const ids = (items: Array<{ id: string }>) => items.map((item) => item.id);
