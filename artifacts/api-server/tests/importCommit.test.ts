/**
 * Импорт выписок, вторая половина (E1.2-T5, T13, T14): сопоставление колонок с запоминанием, подбор счёта, строгая
 * дедупликация (повторный файл, пересечение периодов, одинаковые покупки в один день), решения по строкам, атомарный
 * коммит с пересчётом остатка, отмена в течение 30 дней и права.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import { and, eq, isNull, sql } from "drizzle-orm";
import { accounts, db, importBatches, importMappings, transactions } from "@workspace/db";
import { runImportCommit } from "../src/services/imports/commit";
import { runImportParse } from "../src/services/imports/parse";
import { jobDefinitions } from "../src/jobs/definitions";
import { startJobs, stopJobs } from "../src/jobs";
import { app, auth, registerUser, type TestUser } from "./helpers";

const fixtures = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../lib/statement-parsers/tests/fixtures");
const fixture = (name: string) => readFileSync(path.join(fixtures, name));

const as = (user: TestUser) => ({
  get: (url: string) => request(app).get(url).set(auth(user.token)),
  post: (url: string, body?: object) => request(app).post(url).set(auth(user.token)).send(body ?? {}),
  put: (url: string, body: object) => request(app).put(url).set(auth(user.token)).send(body),
  patch: (url: string, body: object) => request(app).patch(url).set(auth(user.token)).send(body),
});

async function upload(user: TestUser, bytes: Buffer, fields: Record<string, string> = {}) {
  let req = request(app).post("/api/v1/imports").set(auth(user.token));
  for (const [name, value] of Object.entries(fields)) req = req.field(name, value);
  const res = await req.attach("file", bytes, { filename: "statement.csv" });
  expect(res.status, JSON.stringify(res.body)).toBe(202);
  return res.body.id as string;
}

/** Загрузка + разбор (как сделал бы воркер) → импорт на предпросмотре. */
async function preview(user: TestUser, bytes: Buffer, fields: Record<string, string> = {}) {
  const id = await upload(user, bytes, fields);
  await runImportParse(id);
  const batch = (await as(user).get(`/api/v1/imports/${id}`)).body;
  expect(batch.status, JSON.stringify(batch)).toBe("preview");
  return batch;
}

async function commit(user: TestUser, id: string, body: object) {
  const res = await as(user).post(`/api/v1/imports/${id}/commit`, body);
  expect(res.status, JSON.stringify(res.body)).toBe(202);
  expect(res.body.status).toBe("committing");
  await runImportCommit(id);
  return (await as(user).get(`/api/v1/imports/${id}`)).body;
}

async function account(user: TestUser, body: Record<string, unknown> = {}) {
  const res = await as(user).post("/api/v1/accounts", { name: "Т-Банк", kind: "debit_card", institutionCode: "tbank", currency: "RUB", ...body });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body as { id: string };
}

const liveTransactions = (accountId: string) =>
  db.select().from(transactions).where(and(eq(transactions.accountId, accountId), isNull(transactions.deletedAt)));
const balance = async (accountId: string) => (await db.select({ balance: accounts.balance }).from(accounts).where(eq(accounts.id, accountId)))[0].balance;

/** CSV Т-Банка из строк «дата;сумма;описание» — для пересечений периодов. */
function tbankCsv(lines: Array<[string, string, string]>): Buffer {
  const header = "Дата операции;Дата платежа;Номер карты;Статус;Сумма операции;Валюта операции;Сумма платежа;Валюта платежа;Кэшбэк;Категория;MCC;Описание";
  return Buffer.from([header, ...lines.map(([date, amount, description]) => `${date};;*7777;OK;${amount};RUB;${amount};RUB;;;;${description}`)].join("\n"));
}

describe("сопоставление колонок (T5)", () => {
  it("needs_mapping → PUT /mapping → предпросмотр; запомненное разбирает следующий файл сам", async () => {
    const user = await registerUser();
    const id = await upload(user, fixture("generic-split.csv"));
    await runImportParse(id);
    const batch = (await as(user).get(`/api/v1/imports/${id}`)).body;
    expect(batch.status).toBe("needs_mapping");

    const res = await as(user).put(`/api/v1/imports/${id}/mapping`, { mapping: batch.suggestedMapping, remember: true });
    expect(res.status, JSON.stringify(res.body)).toBe(202);
    expect(res.body.status).toBe("uploaded");
    await runImportParse(id, { rememberMapping: true });
    const parsed = (await as(user).get(`/api/v1/imports/${id}`)).body;
    expect(parsed).toMatchObject({ status: "preview", parserCode: "generic_csv@1", stats: { total: 4, new: 4 }, columnMapping: batch.suggestedMapping });
    expect(await db.select().from(importMappings).where(eq(importMappings.userId, user.id))).toHaveLength(1);

    await preview(user, fixture("generic-split.csv")); // второй файл — сразу предпросмотр
  });

  it("неизвестная колонка — 400; без суммы — 400; до разбора — 409; чужой — 404", async () => {
    const [user, other] = [await registerUser(), await registerUser()];
    const id = await upload(user, fixture("generic-split.csv"));
    const early = await as(user).put(`/api/v1/imports/${id}/mapping`, { mapping: { date: "Дата операции", description: "Описание операции", amount: "Приход", signConvention: "signed" } });
    expect(early.status).toBe(409);
    await runImportParse(id);
    const missing = await as(user).put(`/api/v1/imports/${id}/mapping`, { mapping: { date: "Дата", description: "Описание операции", amount: "Приход", signConvention: "signed" } });
    expect(missing.status).toBe(400);
    expect(missing.body.error.message).toMatch(/«Дата»/);
    const noAmount = await as(user).put(`/api/v1/imports/${id}/mapping`, { mapping: { date: "Дата операции", description: "Описание операции", signConvention: "split" } });
    expect(noAmount.status).toBe(400);
    expect((await as(other).put(`/api/v1/imports/${id}/mapping`, { mapping: { date: "Дата операции", description: "Описание операции", amount: "Приход", signConvention: "signed" } })).status).toBe(404);
  });
});

describe("счёт и дубли на предпросмотре (T13)", () => {
  it("счёт находится по цифрам карты; без него — предложение создать «Т-Банк •• 4417»", async () => {
    const user = await registerUser();
    const fresh = await preview(user, fixture("tbank-cp1251.csv"));
    expect(fresh.suggestedAccount).toEqual({ create: { name: "Т-Банк •• 4417", kind: "debit_card", institutionCode: "tbank", currency: "RUB", lastFour: "4417" } });

    const own = await account(user, { lastFour: "9021" });
    const matched = await preview(user, fixture("tbank-cp1251.csv"));
    expect(matched.suggestedAccount).toEqual({ accountId: own.id });
  });

  it("выбранный счёт с другими цифрами — предупреждение", async () => {
    const user = await registerUser();
    const own = await account(user, { lastFour: "0000" });
    const batch = await preview(user, fixture("tbank-utf8-bom.csv"), { accountId: own.id });
    expect(batch.suggestedAccount.accountId).toBe(own.id);
    expect(batch.warnings.join(" ")).toMatch(/•• 1188.*•• 0000/);
  });
});

describe("коммит (T14)", () => {
  it("новый счёт из выписки: операции, категории, остаток; отклонённая банком не попала, холд — pending", async () => {
    const user = await registerUser();
    const batch = await preview(user, fixture("tbank-cp1251.csv"));
    const done = await commit(user, batch.id, { createAccount: batch.suggestedAccount.create });
    expect(done).toMatchObject({ status: "done", stats: { total: 7, new: 6, skipped: 1, imported: 6 } });
    expect(done.committedAt).toBeTruthy();

    const rows = await liveTransactions(done.accountId);
    expect(rows).toHaveLength(6);
    expect(rows.every((row) => row.source === "import" && row.importBatchId === batch.id && row.dedupHash && row.dedupSeq === 1)).toBe(true);
    expect(rows.find((row) => row.description === "АЗС Лукойл")?.status).toBe("pending");
    expect(rows.find((row) => row.description === "STEAMGAMES.COM")).toMatchObject({ amount: "-925.40", originalAmount: "-10.00", originalCurrency: "USD", mcc: "5734" });
    expect(rows.find((row) => row.description === "Зарплата ООО Ромашка")).toMatchObject({ type: "income", amount: "85000.00" });
    expect(await balance(done.accountId)).toBe("82501.10"); // проведённые: 85 000 − 1 234,50 − 250 − 925,40 − 89; холд не входит
    const [created] = await db.select().from(accounts).where(eq(accounts.id, done.accountId));
    expect(created).toMatchObject({ accountName: "Т-Банк •• 4417", source: "import", lastFour: "4417", institutionCode: "tbank" });

    const rowsRes = await as(user).get(`/api/v1/imports/${batch.id}/rows?status=new`);
    expect(rowsRes.body.items.every((row: { transactionId: string | null }) => row.transactionId)).toBe(true);
  });

  it("повторная загрузка того же файла: 0 новых, все — дубли", async () => {
    const user = await registerUser();
    const own = await account(user);
    const first = await preview(user, fixture("tbank-cp1251.csv"), { accountId: own.id });
    await commit(user, first.id, { accountId: own.id });

    const again = await preview(user, fixture("tbank-cp1251.csv"), { accountId: own.id });
    expect(again.duplicateOfImportId).toBe(first.id);
    expect(again.stats).toMatchObject({ new: 0, duplicate: 6, skipped: 1 });
    const done = await commit(user, again.id, { accountId: own.id });
    expect(done.stats.imported).toBe(0);
    expect(await liveTransactions(own.id)).toHaveLength(6);
  });

  it("пересечение периодов: общие операции не дублируются, одинаковые покупки в один день — обе", async () => {
    const user = await registerUser();
    const own = await account(user);
    const july = tbankCsv([["10.07.2026 09:00:00", "-250,00", "Кофейня"], ["10.07.2026 18:00:00", "-250,00", "Кофейня"], ["12.07.2026 12:00:00", "-990,00", "Аптека"]]);
    const first = await preview(user, july, { accountId: own.id });
    expect(first.stats).toMatchObject({ new: 3, duplicate: 0 });
    await commit(user, first.id, { accountId: own.id });

    // вторая выписка пересекается: те же 2 кофе и аптека + третий кофе в тот же день + новая операция
    const overlap = tbankCsv([
      ["10.07.2026 09:00:00", "-250,00", "Кофейня"], ["10.07.2026 18:00:00", "-250,00", "Кофейня"], ["10.07.2026 20:00:00", "-250,00", "Кофейня"],
      ["12.07.2026 12:00:00", "-990,00", "Аптека"], ["20.07.2026 12:00:00", "-1500,00", "Такси"],
    ]);
    const second = await preview(user, overlap, { accountId: own.id });
    expect(second.stats).toMatchObject({ total: 5, new: 2, duplicate: 3 });
    await commit(user, second.id, { accountId: own.id });
    const rows = await liveTransactions(own.id);
    expect(rows).toHaveLength(5);
    expect(rows.filter((row) => row.description === "Кофейня").map((row) => row.dedupSeq).sort()).toEqual([1, 2, 3]);
  });

  it("решения по строкам: пропустить новую, своя категория, импортировать дубль нельзя пропустить молча", async () => {
    const user = await registerUser();
    const own = await account(user);
    const batch = await preview(user, fixture("tbank-utf8-bom.csv"), { accountId: own.id });
    const rows = (await as(user).get(`/api/v1/imports/${batch.id}/rows`)).body.items as Array<{ id: string; description: string; decision: string }>;
    expect(rows.every((row) => row.decision === "import")).toBe(true);
    const telecom = rows.find((row) => row.description === "Т-Мобайл")!;
    const groceries = rows.find((row) => row.description === "ВкусВилл")!;
    const categories = (await as(user).get("/api/v1/categories")).body;
    const list = (Array.isArray(categories) ? categories : categories.items) as Array<{ id: string; kind: string; parentId: string | null }>;
    const category = list.find((item) => item.kind === "expense")!;

    const res = await as(user).patch(`/api/v1/imports/${batch.id}/rows`, { decisions: [
      { rowId: telecom.id, decision: "skip" },
      { rowId: groceries.id, categoryId: category.id },
    ] });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.updated).toBe(2);
    const after = (await as(user).get(`/api/v1/imports/${batch.id}/rows`)).body.items as Array<{ id: string; decision: string; decidedByUser: boolean; categoryId: string }>;
    expect(after.find((row) => row.id === telecom.id)).toMatchObject({ decision: "skip", decidedByUser: true });
    expect(after.find((row) => row.id === groceries.id)?.categoryId).toBe(category.id);

    const done = await commit(user, batch.id, { accountId: own.id });
    expect(done.stats.imported).toBe(4);
    const saved = await liveTransactions(own.id);
    expect(saved.map((row) => row.description)).not.toContain("Т-Мобайл");
    expect(saved.find((row) => row.description === "ВкусВилл")).toMatchObject({ categoryId: category.id, categorySource: "manual" });

    const late = await as(user).patch(`/api/v1/imports/${batch.id}/rows`, { decisions: [{ rowId: telecom.id, decision: "import" }] });
    expect(late.status).toBe(409);
  });

  it("пропущенную банком строку импортировать нельзя; чужая строка — 404", async () => {
    const user = await registerUser();
    const batch = await preview(user, fixture("tbank-cp1251.csv"));
    const skipped = (await as(user).get(`/api/v1/imports/${batch.id}/rows?status=skipped`)).body.items[0];
    const res = await as(user).patch(`/api/v1/imports/${batch.id}/rows`, { decisions: [{ rowId: skipped.id, decision: "import" }] });
    expect(res.status).toBe(400);
    const other = await preview(user, fixture("tbank-utf8-bom.csv"));
    const foreignRow = (await as(user).get(`/api/v1/imports/${other.id}/rows`)).body.items[0];
    expect((await as(user).patch(`/api/v1/imports/${batch.id}/rows`, { decisions: [{ rowId: foreignRow.id, decision: "skip" }] })).status).toBe(404);
  });

  it("проверки: счёт и новый счёт сразу — 400, архив — 409, другая валюта — 409, чужой счёт — 404, второй коммит — 409", async () => {
    const [user, other] = [await registerUser(), await registerUser()];
    const batch = await preview(user, fixture("tbank-utf8-bom.csv"));
    const own = await account(user);
    const both = await as(user).post(`/api/v1/imports/${batch.id}/commit`, { accountId: own.id, createAccount: batch.suggestedAccount.create });
    expect(both.status).toBe(400);
    expect((await as(user).post(`/api/v1/imports/${batch.id}/commit`, {})).status).toBe(400);

    const archived = await account(user);
    await as(user).post(`/api/v1/accounts/${archived.id}/archive`);
    const archivedRes = await as(user).post(`/api/v1/imports/${batch.id}/commit`, { accountId: archived.id });
    expect(archivedRes.status).toBe(409);
    expect(archivedRes.body.error.code).toBe("ACCOUNT_ARCHIVED");

    const dollars = await account(user, { currency: "USD" });
    const currency = await as(user).post(`/api/v1/imports/${batch.id}/commit`, { accountId: dollars.id });
    expect(currency.status).toBe(409);
    expect(currency.body.error.code).toBe("CURRENCY_MISMATCH");

    const foreign = await account(other);
    expect((await as(user).post(`/api/v1/imports/${batch.id}/commit`, { accountId: foreign.id })).status).toBe(404);
    expect((await as(other).post(`/api/v1/imports/${batch.id}/commit`, { accountId: foreign.id })).status).toBe(404);

    await as(user).post(`/api/v1/imports/${batch.id}/commit`, { accountId: own.id }).expect(202);
    expect((await as(user).post(`/api/v1/imports/${batch.id}/commit`, { accountId: own.id })).status).toBe(409);
  });

  it("атомарность: ошибка посреди коммита не оставляет ни одной операции, импорт возвращается в предпросмотр", async () => {
    const user = await registerUser();
    const own = await account(user);
    const batch = await preview(user, fixture("tbank-cp1251.csv"), { accountId: own.id });
    // последняя строка выписки не вставится — остальные уже в той же транзакции
    await db.execute(sql`CREATE OR REPLACE FUNCTION test_import_boom() RETURNS trigger AS $$
      BEGIN IF NEW.description = 'Метро Москвы' AND NEW.import_batch_id IS NOT NULL THEN RAISE EXCEPTION 'boom'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql`);
    await db.execute(sql`CREATE TRIGGER test_import_boom BEFORE INSERT ON transactions FOR EACH ROW EXECUTE FUNCTION test_import_boom()`);
    try {
      await as(user).post(`/api/v1/imports/${batch.id}/commit`, { accountId: own.id }).expect(202);
      await runImportCommit(batch.id);
    } finally {
      await db.execute(sql`DROP TRIGGER test_import_boom ON transactions`);
      await db.execute(sql`DROP FUNCTION test_import_boom()`);
    }
    expect(await liveTransactions(own.id)).toHaveLength(0);
    expect(await balance(own.id)).toBe("0.00");
    const failed = (await as(user).get(`/api/v1/imports/${batch.id}`)).body;
    expect(failed).toMatchObject({ status: "preview", errorCode: "INTERNAL" });
    expect(failed.errorMessage).toMatch(/ничего не записано/);

    const done = await commit(user, batch.id, { accountId: own.id }); // повтор после ошибки проходит
    expect(done.stats.imported).toBe(6);
  });

  it("счёт ушёл в архив до коммита — понятная ошибка, ничего не записано", async () => {
    const user = await registerUser();
    const own = await account(user);
    const batch = await preview(user, fixture("tbank-utf8-bom.csv"), { accountId: own.id });
    await as(user).post(`/api/v1/imports/${batch.id}/commit`, { accountId: own.id }).expect(202);
    await db.update(accounts).set({ archivedAt: new Date() }).where(eq(accounts.id, own.id));
    await runImportCommit(batch.id);
    const result = (await as(user).get(`/api/v1/imports/${batch.id}`)).body;
    expect(result).toMatchObject({ status: "preview", errorCode: "COMMIT_REJECTED" });
    expect(await liveTransactions(own.id)).toHaveLength(0);
  });
});

describe("отмена импорта", () => {
  it("мягко удаляет операции батча, пересчитывает остаток; число правленых видно до отмены", async () => {
    const user = await registerUser();
    const own = await account(user, { openingBalance: "1000.00" });
    const batch = await preview(user, fixture("tbank-cp1251.csv"), { accountId: own.id });
    await commit(user, batch.id, { accountId: own.id });
    expect(await balance(own.id)).toBe("83501.10");
    const [edited] = await liveTransactions(own.id);
    await as(user).patch(`/api/v1/transactions/${edited.id}`, { note: "моя заметка" }).expect(200);
    expect((await as(user).get(`/api/v1/imports/${batch.id}`)).body.editedCount).toBe(1);

    const res = await as(user).post(`/api/v1/imports/${batch.id}/undo`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({ status: "undone", stats: { undone: 6, editedCount: 1 } });
    expect(await liveTransactions(own.id)).toHaveLength(0);
    expect(await balance(own.id)).toBe("1000.00");
    expect((await as(user).post(`/api/v1/imports/${batch.id}/undo`)).status).toBe(409);

    // после отмены тот же файл снова импортируется целиком
    const again = await preview(user, fixture("tbank-cp1251.csv"), { accountId: own.id });
    expect(again.duplicateOfImportId).toBeNull();
    expect(again.stats.new).toBe(6);
  });

  it("старше 30 дней — 409; чужой — 404; не сохранённый — 409", async () => {
    const [user, other] = [await registerUser(), await registerUser()];
    const own = await account(user);
    const batch = await preview(user, fixture("tbank-utf8-bom.csv"), { accountId: own.id });
    expect((await as(user).post(`/api/v1/imports/${batch.id}/undo`)).status).toBe(409);
    await commit(user, batch.id, { accountId: own.id });
    expect((await as(other).post(`/api/v1/imports/${batch.id}/undo`)).status).toBe(404);
    await db.update(importBatches).set({ committedAt: new Date(Date.now() - 31 * 86_400_000) }).where(eq(importBatches.id, batch.id));
    expect((await as(user).post(`/api/v1/imports/${batch.id}/undo`)).status).toBe(409);
    expect(await liveTransactions(own.id)).toHaveLength(5);
  });
});

describe("через очередь", () => {
  afterEach(async () => {
    await stopJobs();
  });

  it("загрузка → разбор → коммит воркером", async () => {
    await startJobs("both", jobDefinitions.filter((definition) => ["import.parse", "import.commit"].includes(definition.name)));
    const user = await registerUser();
    const own = await account(user);
    const id = await upload(user, fixture("tbank-utf8-bom.csv"), { accountId: own.id });
    const waitFor = async (status: string) => {
      for (let i = 0; i < 50; i++) {
        const body = (await as(user).get(`/api/v1/imports/${id}`)).body;
        if (body.status === status) return body;
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      throw new Error(`не дождались ${status}`);
    };
    await waitFor("preview");
    await as(user).post(`/api/v1/imports/${id}/commit`, { accountId: own.id }).expect(202);
    const done = await waitFor("done");
    expect(done.stats.imported).toBe(5);
    expect(await liveTransactions(own.id)).toHaveLength(5);
  });
});
