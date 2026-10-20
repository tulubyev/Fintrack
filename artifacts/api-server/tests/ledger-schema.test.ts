/**
 * Схема счетов и операций E1.1-T1: ограничения в БД и сводка на главной без переводов и корректировок.
 */
import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { db, accounts, transactions } from "@workspace/db";
import { app, auth, registerUser, type TestUser } from "./helpers";

let user: TestUser;
let accountId: string;
const today = new Date().toISOString().slice(0, 10);

beforeAll(async () => {
  user = await registerUser();
  const [account] = await db.insert(accounts).values({ userId: user.id, accountName: "Наличные", kind: "cash", balance: "0" }).returning();
  accountId = account.id;
});

const tx = (values: Partial<typeof transactions.$inferInsert>) =>
  db.insert(transactions).values({ userId: user.id, accountId, description: "тест", transactionDate: new Date(), localDate: today, amount: "-1.00", ...values });

// drizzle оборачивает ошибку PostgreSQL: код ограничения — в cause
const constraintOf = async (promise: Promise<unknown>) => {
  try { await promise; return null; } catch (error: any) { return error?.cause?.constraint ?? error?.constraint ?? String(error); }
};

describe("ограничения схемы", () => {
  it("счёт создаётся без банковского подключения, вид — из списка", async () => {
    const [manual] = await db.insert(accounts).values({ userId: user.id, accountName: "Брокерский", kind: "brokerage", balance: "0" }).returning();
    expect(manual).toMatchObject({ bankConnectionId: null, source: "manual", includeInTotal: true, openingBalance: "0.00" });
    expect(await constraintOf(db.insert(accounts).values({ userId: user.id, accountName: "x", kind: "crypto", balance: "0" }))).toBe("accounts_kind_check");
  });

  it("расход — только с минусом, доход — только с плюсом", async () => {
    expect(await constraintOf(tx({ type: "expense", amount: "100.00" }))).toBe("tx_sign_check");
    expect(await constraintOf(tx({ type: "income", amount: "-100.00" }))).toBe("tx_sign_check");
    expect(await constraintOf(tx({ type: "transfer", amount: "-100.00" }))).toBeNull();
    // неизвестный тип нарушает и tx_type_check, и tx_sign_check — PostgreSQL называет одно из них
    expect(await constraintOf(tx({ type: "refund" as never, amount: "100.00" }))).toMatch(/^tx_(type|sign)_check$/);
  });
});

describe("сводка на главной", () => {
  it("считает доходы и расходы без переводов, корректировок, удалённых и исключённых операций", async () => {
    const other = await registerUser();
    const [account] = await db.insert(accounts).values({ userId: other.id, accountName: "Карта", kind: "debit_card", balance: "0" }).returning();
    const base = { userId: other.id, accountId: account.id, description: "тест", transactionDate: new Date(), localDate: today };
    await db.insert(transactions).values([
      { ...base, type: "income", amount: "50000.00", amountRub: "50000.00" },
      { ...base, type: "expense", amount: "-1234.50", amountRub: "-1234.50" },
      { ...base, type: "transfer", amount: "-10000.00", amountRub: "-10000.00" },
      { ...base, type: "adjustment", amount: "300.00", amountRub: "300.00" },
      { ...base, type: "expense", amount: "-999.00", amountRub: "-999.00", deletedAt: new Date() },
      { ...base, type: "expense", amount: "-777.00", amountRub: "-777.00", excludeFromStats: true },
    ]);

    const res = await request(app).get("/api/v1/dashboard/summary").set(auth(other.token));
    expect(res.status).toBe(200);
    expect(res.body.period).toMatchObject({ income: "50000.00", expense: "1234.50" });
  });
});
