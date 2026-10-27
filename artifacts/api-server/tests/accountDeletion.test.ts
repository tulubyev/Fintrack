/**
 * Удаление аккаунта (E1.0-T6, 152-ФЗ): DELETE /api/v1/me стирает строки пользователя во всех таблицах и его файлы.
 * Список таблиц берётся из самой базы (все внешние ключи на users и documents.user_id): новая пользовательская таблица
 * без каскада или без данных в этом тесте его уронит. Чужие данные и записи, где пользователь лишь администратор, не трогаются.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import request from "supertest";
import sharp from "sharp";
import { eq, sql } from "drizzle-orm";
import {
  db, adminLogs, aiChatSessions, bankConnections, budgetAlerts, documents, documentVerificationHistory, familyGroupMembers,
  familyGroups, importMappings, llmUsageDaily, productEvents, recurringSeries, systemSettings, userCategoryPrefs, userVerifications, users,
  verificationCodes, verificationRequests,
} from "@workspace/db";
import { config } from "../config/environment";
import { notify } from "../src/services/notificationService";
import { app, auth, registerUser, seedDocumentType, type TestUser } from "./helpers";

const PASSWORD = "Test-Passw0rd!";
const fixtures = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../lib/statement-parsers/tests/fixtures");
const call = (user: TestUser, method: "get" | "post" | "put", url: string) => request(app)[method](url).set(auth(user.token));
const today = new Date().toISOString().slice(0, 10);

/** Таблицы и колонки, по которым строки принадлежат пользователю: внешние ключи на users и documents.user_id (varchar). */
async function ownerColumns(): Promise<{ table: string; column: string; rule: string }[]> {
  const result = await db.execute(sql`
    select c.conrelid::regclass::text as "table", a.attname as "column", c.confdeltype as rule
    from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
    where c.contype = 'f' and c.confrelid = 'users'::regclass`);
  return [...(result.rows as { table: string; column: string; rule: string }[]), { table: "documents", column: "user_id", rule: "explicit" }];
}

async function countFor(table: string, column: string, userId: string): Promise<number> {
  const result = await db.execute(sql`select count(*)::int as n from ${sql.identifier(table)} where ${sql.identifier(column)}::text = ${userId}`);
  return (result.rows[0] as { n: number }).n;
}

/** Данные во всех пользовательских таблицах: через API, где он есть, остальное — прямо в базу. */
async function seedEverything(user: TestUser, other: TestUser) {
  const account = await call(user, "post", "/api/v1/accounts").send({ name: "Карта", kind: "debit_card", openingBalance: "10000.00", openingBalanceDate: today });
  expect(account.status).toBe(201);
  const categories = (await call(user, "get", "/api/v1/categories")).body.items as { id: string; code: string }[];
  const food = categories.find((item) => item.code === "food")!.id;
  const parent = await call(user, "post", "/api/v1/categories").send({ name: `Своя ${randomUUID().slice(0, 6)}`, kind: "expense" });
  expect(parent.status).toBe(201);
  expect((await call(user, "post", "/api/v1/categories").send({ name: "Подкатегория", kind: "expense", parentId: parent.body.id })).status).toBe(201);
  const tx = await call(user, "post", "/api/v1/transactions").send({ type: "expense", accountId: account.body.id, categoryId: food, amount: "9000", merchant: "Магазин", date: today });
  expect(tx.status).toBe(201);
  const budget = await call(user, "post", "/api/v1/budgets").send({ categoryId: food, amount: "10000" });
  expect(budget.status).toBe(201);
  await db.insert(budgetAlerts).values({ budgetId: budget.body.id, periodStart: `${today.slice(0, 7)}-01`, threshold: 80 });
  const goal = await call(user, "post", "/api/v1/goals").send({ name: "Отпуск", targetAmount: "50000" });
  expect(goal.status).toBe(201);
  expect((await call(user, "post", `/api/v1/goals/${goal.body.id}/contributions`).send({ amount: "1000", date: today })).status).toBe(201);
  expect((await call(user, "post", "/api/v1/category-rules").send({ field: "merchant", op: "equals", pattern: "Магазин", categoryId: food })).status).toBe(201);
  await db.insert(recurringSeries).values({
    userId: user.id, groupKey: `test:${randomUUID()}`, displayName: "Подписка", direction: "out", kind: "subscription", periodicity: "monthly",
    intervalDays: 30, amountLast: "299.00", amountMedian: "299.00", amountMin: "299.00", amountMax: "299.00", occurrences: 3,
    firstDate: today, lastDate: today, confidence: 0.9,
  });
  expect((await call(user, "put", "/api/v1/notification-prefs").send({ hidePushAmounts: true, groups: [{ type: "import", push: false }] })).status).toBe(200);
  expect((await call(user, "put", "/api/v1/devices/current/push").send({ provider: "fcm", token: `fcm-${randomUUID()}` })).status).toBe(204);
  const imported = await call(user, "post", "/api/v1/imports").attach("file", readFileSync(path.join(fixtures, "tbank-utf8-bom.csv")), { filename: "выписка.csv" });
  expect(imported.status).toBe(202);

  const type = await seedDocumentType();
  const doc = await call(user, "post", "/api/documents/upload").field("documentTypeId", type.id)
    .attach("document", Buffer.from("%PDF-1.4 test"), { filename: "passport.pdf", contentType: "application/pdf" });
  expect(doc.status).toBe(200);
  await db.insert(documentVerificationHistory).values({ documentId: doc.body.document.id, previousStatus: "pending", newStatus: "approved", changedBy: other.id });
  const image = await call(user, "post", "/api/profile/upload-image").attach("profileImage", await sharp({ create: { width: 8, height: 8, channels: 3, background: "#ffffff" } }).png().toBuffer(), { filename: "me.png", contentType: "image/png" });
  expect(image.status).toBe(200);

  const [connection] = await db.insert(bankConnections).values({ userId: user.id, bankCode: "test", bankName: "Тестовый банк" }).returning();
  expect(connection).toBeTruthy();
  await db.insert(aiChatSessions).values({ userId: user.id, sessionId: randomUUID(), messages: [] });
  const [group] = await db.insert(familyGroups).values({ name: "Семья", adminUserId: user.id }).returning();
  await db.insert(familyGroupMembers).values([{ groupId: group.id, userId: user.id }, { groupId: group.id, userId: other.id }]);
  await db.insert(userVerifications).values({ userId: user.id });
  await db.insert(verificationCodes).values({ userId: user.id, type: "email", code: "123456", target: "x@example.test", expiresAt: new Date(Date.now() + 60_000) });
  await db.insert(verificationRequests).values({ userId: user.id, requestedLevel: 2, currentLevel: 1 });
  // пользователь — проверяющий чужой заявки, автор записи журнала и настройки: после удаления ссылки обнуляются
  await db.insert(verificationRequests).values({ userId: other.id, requestedLevel: 2, currentLevel: 1, reviewedBy: user.id });
  await db.insert(adminLogs).values({ adminUserId: user.id, action: "test", targetType: "user", targetId: other.id });
  await db.insert(systemSettings).values({ key: `test-${randomUUID()}`, value: {}, category: "test", updatedBy: user.id });
  await notify(user.id, { type: "system", title: "Проверка", dedupKey: randomUUID() });
  await db.insert(llmUsageDaily).values({ userId: user.id, day: today });
  await db.insert(importMappings).values({ userId: user.id, headerFingerprint: randomUUID(), mapping: {} });
  await db.insert(productEvents).values({ userId: user.id, name: "app_opened", platform: "web", occurredAt: new Date() });
  await db.insert(userCategoryPrefs).values({ userId: user.id, categoryId: food, hidden: true }).onConflictDoNothing();
  // остальное (сессии, категории, операции, бюджеты…) создано через API выше
}

describe("DELETE /api/v1/me", () => {
  it("неверный пароль — 403, без пароля — 400, без входа — 401; данные на месте", async () => {
    const user = await registerUser();
    expect((await request(app).delete("/api/v1/me").set(auth(user.token)).send({ password: "wrong" })).status).toBe(403);
    expect((await request(app).delete("/api/v1/me").set(auth(user.token)).send({})).status).toBe(400);
    expect((await request(app).delete("/api/v1/me").send({ password: PASSWORD })).status).toBe(401);
    expect(await db.select().from(users).where(eq(users.id, user.id))).toHaveLength(1);
  });

  it("стирает строки пользователя во всех таблицах и его файлы; чужие данные остаются", async () => {
    const user = await registerUser();
    const other = await registerUser();
    await seedEverything(user, other);

    const columns = await ownerColumns();
    // каскад или обнуление — у каждого внешнего ключа на users (иначе DELETE упадёт или оставит хвост)
    expect(columns.filter((item) => item.rule === "a" || item.rule === "r"), "ключи без ON DELETE").toEqual([]);
    const ownership = columns.filter((item) => item.rule === "c" || item.rule === "explicit");
    for (const { table, column } of ownership) {
      expect(await countFor(table, column, user.id), `${table}.${column}: тест должен засеять таблицу`).toBeGreaterThan(0);
    }
    const [{ profileImageUrl }] = await db.select({ profileImageUrl: users.profileImageUrl }).from(users).where(eq(users.id, user.id));
    const imagePath = path.join(config.storage.uploadsDir, "profile-images", path.basename(profileImageUrl!));
    const [doc] = await db.select().from(documents).where(eq(documents.userId, user.id));
    const docPath = path.join(config.storage.documentsDir, doc.filePath);
    const importsDir = path.join(config.storage.importsDir, user.id);
    expect(existsSync(imagePath) && existsSync(docPath) && readdirSync(importsDir).length > 0).toBe(true);

    const res = await request(app).delete("/api/v1/me").set(auth(user.token)).send({ password: PASSWORD });
    expect(res.status).toBe(204);

    for (const { table, column } of columns) {
      expect(await countFor(table, column, user.id), `${table}.${column}`).toBe(0);
    }
    expect(await db.select().from(documentVerificationHistory).where(eq(documentVerificationHistory.documentId, doc.id))).toEqual([]);
    expect(existsSync(imagePath)).toBe(false);
    expect(existsSync(docPath)).toBe(false);
    expect(existsSync(importsDir)).toBe(false);

    // чужое осталось: участник семьи (группа удалена вместе с админом — его членство тоже), заявка, журнал, настройка
    expect(await countFor("users", "id", other.id)).toBe(1);
    expect(await countFor("verification_requests", "user_id", other.id)).toBe(1);
    expect(await countFor("admin_logs", "target_id", other.id)).toBe(1);
    // старый токен больше не работает
    expect((await call(user, "get", "/api/v1/accounts")).status).toBe(401);
    expect((await call(other, "get", "/api/v1/accounts")).status).toBe(200);
  });
});
