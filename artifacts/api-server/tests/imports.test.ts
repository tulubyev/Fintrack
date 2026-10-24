/**
 * Импорт выписок (E1.2-T3, T4): загрузка с проверкой сигнатуры и размера, зашифрованный файл, повторный файл,
 * разбор в задаче import.parse (предпросмотр, сопоставление, ошибки), строки, удаление до коммита, лимит, очистка
 * через 30 дней и права: B не видит и не трогает импорт A.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { db, importBatches, importMappings, importRows } from "@workspace/db";
import { config } from "../config/environment";
import { cleanupImports } from "../src/services/imports/cleanup";
import { runImportParse } from "../src/services/imports/parse";
import { jobDefinitions } from "../src/jobs/definitions";
import { startJobs, stopJobs } from "../src/jobs";
import { app, auth, registerUser, seedFinance, type TestUser } from "./helpers";

const fixtures = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../lib/statement-parsers/tests/fixtures");
const fixture = (name: string) => readFileSync(path.join(fixtures, name));
const storedFile = (storedPath: string) => path.join(config.storage.importsDir, storedPath);

const upload = (user: TestUser, bytes: Buffer, filename = "выписка.csv", fields: Record<string, string> = {}) => {
  let req = request(app).post("/api/v1/imports").set(auth(user.token));
  for (const [name, value] of Object.entries(fields)) req = req.field(name, value);
  return req.attach("file", bytes, { filename });
};
const get = (user: TestUser, url: string) => request(app).get(url).set(auth(user.token));

async function uploaded(user: TestUser, name: string, fields: Record<string, string> = {}) {
  const res = await upload(user, fixture(name), name, fields);
  expect(res.status, JSON.stringify(res.body)).toBe(202);
  return res.body as { id: string; status: string; duplicateOfImportId: string | null };
}

async function parsed(user: TestUser, name: string) {
  const batch = await uploaded(user, name);
  await runImportParse(batch.id);
  return (await get(user, `/api/v1/imports/${batch.id}`)).body;
}

describe("загрузка", () => {
  it("CSV Т-Банка: 202, файл на диске зашифрован, имя файла по-русски", async () => {
    const user = await registerUser();
    const res = await upload(user, fixture("tbank-utf8-bom.csv"), "Выписка Т-Банк.csv");
    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({ status: "uploaded", fileType: "csv", fileName: "Выписка Т-Банк.csv", duplicateOfImportId: null });
    const [batch] = await db.select().from(importBatches).where(eq(importBatches.id, res.body.id));
    expect(batch.storedPath).toBe(`${user.id}/${batch.id}.enc`);
    const onDisk = readFileSync(storedFile(batch.storedPath!));
    expect(onDisk.subarray(0, 4).toString()).toBe("FTI1");
    expect(onDisk.includes(Buffer.from("Кофейня"))).toBe(false);
    expect(batch.fileSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("тот же файл повторно — duplicateOfImportId; удалённый импорт повтором не считается", async () => {
    const user = await registerUser();
    const first = await uploaded(user, "tbank-utf8-bom.csv");
    const second = await uploaded(user, "tbank-utf8-bom.csv");
    expect(second.duplicateOfImportId).toBe(first.id);
    expect((await get(user, `/api/v1/imports/${second.id}`)).body.duplicateOfImportId).toBe(first.id);
    expect((await get(user, `/api/v1/imports/${first.id}`)).body.duplicateOfImportId).toBeNull();

    const other = await registerUser(); // у другого пользователя тот же файл — не повтор
    expect((await uploaded(other, "tbank-utf8-bom.csv")).duplicateOfImportId).toBeNull();

    await request(app).delete(`/api/v1/imports/${first.id}`).set(auth(user.token)).expect(204);
    await request(app).delete(`/api/v1/imports/${second.id}`).set(auth(user.token)).expect(204);
    expect((await uploaded(user, "tbank-utf8-bom.csv")).duplicateOfImportId).toBeNull();
  });

  it("тип — по содержимому: картинка и старый XLS → 415, имя .csv не спасает", async () => {
    const user = await registerUser();
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52]);
    const res = await upload(user, png, "statement.csv");
    expect(res.status).toBe(415);
    expect(res.body.error.code).toBe("UNSUPPORTED_FILE");
    const xls = await upload(user, Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]), "old.xls");
    expect(xls.status).toBe(415);
    expect(xls.body.error.message).toMatch(/XLSX или CSV/);
  });

  it("больше 15 МБ → 413; без файла → 400", async () => {
    const user = await registerUser();
    const big = Buffer.alloc(15 * 1024 * 1024 + 1, 0x61);
    const res = await upload(user, big, "big.csv");
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe("FILE_TOO_LARGE");
    const empty = await request(app).post("/api/v1/imports").set(auth(user.token)).field("institutionCode", "tbank");
    expect(empty.status).toBe(400);
  });

  it("счёт: свой — запоминается, чужой или кривой id — 404", async () => {
    const [a, b] = [await registerUser(), await registerUser()];
    const { account } = await seedFinance(a.id);
    const own = await uploaded(a, "tbank-utf8-bom.csv", { accountId: account.id, institutionCode: "tbank" });
    expect((await get(a, `/api/v1/imports/${own.id}`)).body).toMatchObject({ accountId: account.id, institutionCode: "tbank" });
    expect((await upload(b, fixture("tbank-utf8-bom.csv"), "t.csv", { accountId: account.id })).status).toBe(404);
    expect((await upload(b, fixture("tbank-utf8-bom.csv"), "t.csv", { accountId: "не-uuid" })).status).toBe(404);
  });

  it("не больше 30 загрузок в сутки → 429", async () => {
    const user = await registerUser();
    await db.insert(importBatches).values(Array.from({ length: 30 }, (_, i) => ({
      userId: user.id, fileName: `f${i}.csv`, fileSize: 1, fileSha256: "0".repeat(64), fileType: "csv", status: "cancelled",
    })));
    const res = await upload(user, fixture("tbank-utf8-bom.csv"));
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe("RATE_LIMITED");
  });
});

describe("разбор (import.parse)", () => {
  it("Т-Банк → предпросмотр: статистика, период, карты; отклонённая — пропущена", async () => {
    const user = await registerUser();
    const batch = await parsed(user, "tbank-cp1251.csv");
    expect(batch).toMatchObject({
      status: "preview",
      parserCode: "tbank_csv@1",
      institutionCode: "tbank",
      periodFrom: "2026-09-24",
      periodTo: "2026-09-30",
      stats: { total: 7, new: 6, skipped: 1, duplicate: 0, possibleDuplicate: 0, error: 0 },
      cardLast4: ["4417", "9021"],
      accountCurrency: "RUB",
      errorCode: null,
    });
    expect(batch.parsedAt).toBeTruthy();

    const rows = await get(user, `/api/v1/imports/${batch.id}/rows`);
    expect(rows.status).toBe(200);
    expect(rows.body.items).toHaveLength(7);
    expect(rows.body.items[0]).toMatchObject({ rowIndex: 0, status: "new", decision: "import", amount: "-1234.50", description: "Пятёрочка", mcc: "5411" });
    expect(rows.body.items[0].raw).toBeUndefined(); // исходные ячейки наружу не отдаются
    const skipped = await get(user, `/api/v1/imports/${batch.id}/rows?status=skipped`);
    expect(skipped.body.items).toEqual([expect.objectContaining({ description: "Перевод по номеру телефона", decision: "skip", errorMessage: "Пропущено: отклонена банком" })]);

    const page = await get(user, `/api/v1/imports/${batch.id}/rows?limit=3`);
    expect(page.body.items.map((row: { rowIndex: number }) => row.rowIndex)).toEqual([0, 1, 2]);
    const next = await get(user, `/api/v1/imports/${batch.id}/rows?limit=3&cursor=${page.body.nextCursor}`);
    expect(next.body.items.map((row: { rowIndex: number }) => row.rowIndex)).toEqual([3, 4, 5]);
  });

  it("повтор задачи после успеха ничего не меняет; строки до разбора — 409", async () => {
    const user = await registerUser();
    const batch = await uploaded(user, "tbank-utf8-bom.csv");
    const early = await get(user, `/api/v1/imports/${batch.id}/rows`);
    expect(early.status).toBe(409);
    expect(early.body.error.code).toBe("IMPORT_STATE_CONFLICT");
    await runImportParse(batch.id);
    await runImportParse(batch.id);
    expect(await db.select().from(importRows).where(eq(importRows.batchId, batch.id))).toHaveLength(5);
  });

  it("незнакомый CSV → needs_mapping с превью; запомненное сопоставление разбирает без вопросов", async () => {
    const user = await registerUser();
    const batch = await parsed(user, "generic-split.csv");
    expect(batch.status).toBe("needs_mapping");
    expect(batch.mappingPreview).toMatchObject({ header: expect.arrayContaining(["Дата операции", "Приход", "Расход"]), headerRowIndex: 3 });
    expect(batch.suggestedMapping).toMatchObject({ date: "Дата операции", income: "Приход", expense: "Расход", signConvention: "split" });

    await db.insert(importMappings).values({ userId: user.id, headerFingerprint: batch.mappingPreview.fingerprint, mapping: batch.suggestedMapping });
    const again = await parsed(user, "generic-split.csv");
    expect(again).toMatchObject({ status: "preview", parserCode: "generic_csv@1", stats: { total: 4, new: 4 } });
  });

  it("PDF пока не читаем — failed с понятным текстом", async () => {
    const user = await registerUser();
    const res = await upload(user, Buffer.from("%PDF-1.7\n%âãÏÓ\n1 0 obj\n"), "sber.pdf");
    expect(res.status).toBe(202);
    expect(res.body.fileType).toBe("pdf");
    await runImportParse(res.body.id);
    const batch = (await get(user, `/api/v1/imports/${res.body.id}`)).body;
    expect(batch).toMatchObject({ status: "failed", errorCode: "FORMAT_NOT_RECOGNIZED" });
    expect(batch.errorMessage).toMatch(/CSV или Excel/);
  });

  it("удалённый во время разбора импорт не воскресает", async () => {
    const user = await registerUser();
    const batch = await uploaded(user, "tbank-utf8-bom.csv");
    await db.update(importBatches).set({ status: "cancelled" }).where(eq(importBatches.id, batch.id));
    await runImportParse(batch.id);
    expect((await get(user, `/api/v1/imports/${batch.id}`)).body.status).toBe("cancelled");
    expect(await db.select().from(importRows).where(eq(importRows.batchId, batch.id))).toHaveLength(0);
  });
});

describe("очередь", () => {
  afterEach(async () => {
    await stopJobs();
  });

  it("загрузка ставит import.parse, воркер разбирает файл", async () => {
    await startJobs("both", jobDefinitions.filter((definition) => definition.name === "import.parse"));
    const user = await registerUser();
    const batch = await uploaded(user, "tbank-utf8-bom.csv");
    let status = batch.status;
    for (let i = 0; i < 50 && status !== "preview"; i++) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      status = (await get(user, `/api/v1/imports/${batch.id}`)).body.status;
    }
    expect(status).toBe("preview");
  });
});

describe("удаление, список, очистка", () => {
  it("DELETE до коммита стирает файл и строки; повторно — 409", async () => {
    const user = await registerUser();
    const batch = await parsed(user, "tbank-utf8-bom.csv");
    const [row] = await db.select().from(importBatches).where(eq(importBatches.id, batch.id));
    await request(app).delete(`/api/v1/imports/${batch.id}`).set(auth(user.token)).expect(204);
    expect(existsSync(storedFile(row.storedPath!))).toBe(false);
    expect(await db.select().from(importRows).where(eq(importRows.batchId, batch.id))).toHaveLength(0);
    const again = await request(app).delete(`/api/v1/imports/${batch.id}`).set(auth(user.token));
    expect(again.status).toBe(409);
    expect((await get(user, "/api/v1/imports")).body.items.map((item: { id: string }) => item.id)).not.toContain(batch.id);
  });

  it("список — новые сверху, с курсором", async () => {
    const user = await registerUser();
    const first = await uploaded(user, "tbank-utf8-bom.csv");
    const second = await uploaded(user, "generic-split.csv");
    const page = await get(user, "/api/v1/imports?limit=1");
    expect(page.body.items.map((item: { id: string }) => item.id)).toEqual([second.id]);
    const next = await get(user, `/api/v1/imports?limit=1&cursor=${encodeURIComponent(page.body.nextCursor)}`);
    expect(next.body.items.map((item: { id: string }) => item.id)).toEqual([first.id]);
    expect(next.body.nextCursor).toBeNull();
  });

  it("через 30 дней: файл удалён, брошенный предпросмотр — cancelled без строк; свежий не тронут", async () => {
    const user = await registerUser();
    const old = await parsed(user, "tbank-utf8-bom.csv");
    const fresh = await uploaded(user, "generic-split.csv");
    await db.update(importBatches).set({ createdAt: new Date(Date.now() - 31 * 86_400_000) }).where(eq(importBatches.id, old.id));
    const [before] = await db.select().from(importBatches).where(eq(importBatches.id, old.id));
    await cleanupImports();
    const [after] = await db.select().from(importBatches).where(eq(importBatches.id, old.id));
    expect(after).toMatchObject({ status: "cancelled", storedPath: null });
    expect(existsSync(storedFile(before.storedPath!))).toBe(false);
    expect(await db.select().from(importRows).where(eq(importRows.batchId, old.id))).toHaveLength(0);
    const [untouched] = await db.select().from(importBatches).where(eq(importBatches.id, fresh.id));
    expect(untouched.storedPath).not.toBeNull();
    expect(existsSync(storedFile(untouched.storedPath!))).toBe(true);
  });
});

describe("права", () => {
  it("B не видит, не читает строки и не удаляет импорт A", async () => {
    const [a, b] = [await registerUser(), await registerUser()];
    const batch = await parsed(a, "tbank-utf8-bom.csv");
    expect((await get(b, `/api/v1/imports/${batch.id}`)).status).toBe(404);
    expect((await get(b, `/api/v1/imports/${batch.id}/rows`)).status).toBe(404);
    expect((await request(app).delete(`/api/v1/imports/${batch.id}`).set(auth(b.token))).status).toBe(404);
    expect((await get(b, "/api/v1/imports")).body.items).toEqual([]);
    expect((await get(a, `/api/v1/imports/${batch.id}`)).body.status).toBe("preview");
    expect((await get(b, "/api/v1/imports/not-a-uuid")).status).toBe(404);
  });

  it("без входа — 401", async () => {
    expect((await request(app).get("/api/v1/imports")).status).toBe(401);
  });
});
