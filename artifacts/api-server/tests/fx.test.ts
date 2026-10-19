/**
 * Курсы ЦБ (E1.1-T2): разбор XML в windows-1251, сохранение, досчёт amount_rub, начальное заполнение.
 * Сеть подменяется: ответы ЦБ собираются здесь в точном формате XML_daily.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { and, between, eq } from "drizzle-orm";
import { db, accounts, fxRates, transactions } from "@workspace/db";
import { backfillRates, parseCbrXml, syncDailyRates } from "../src/services/fxService";
import { jobDefinitions } from "../src/jobs/definitions";
import { jobsBoss, startJobs, stopJobs } from "../src/jobs";
import { registerUser } from "./helpers";

// windows-1251: кириллица А–я = 0xC0–0xFF, Ё = 0xA8, ё = 0xB8, остальное — ASCII
function encode1251(text: string): Uint8Array {
  return Uint8Array.from([...text].map((char) => {
    const code = char.charCodeAt(0);
    if (code >= 0x410 && code <= 0x44f) return code - 0x410 + 0xc0;
    if (char === "Ё") return 0xa8;
    if (char === "ё") return 0xb8;
    return code;
  }));
}

const cbrXml = (date: string, rates: Array<[string, number, string, string]>) => encode1251(
  `<?xml version="1.0" encoding="windows-1251"?><ValCurs Date="${date}" name="Foreign Currency Market">`
  + rates.map(([code, nominal, name, value], i) =>
    `<Valute ID="R0${i}"><NumCode>${100 + i}</NumCode><CharCode>${code}</CharCode><Nominal>${nominal}</Nominal><Name>${name}</Name><Value>${value}</Value><VunitRate>0</VunitRate></Valute>`).join("")
  + "</ValCurs>",
);

// Ответы ЦБ по date_req=DD/MM/YYYY; в выходные ЦБ отдаёт курсы пятницы с её датой
function stubCbr(byRequestDate: Record<string, Uint8Array>) {
  const fetchMock = vi.fn(async (url: URL | string) => {
    const date = new URL(String(url)).searchParams.get("date_req") ?? "";
    const body = byRequestDate[date];
    return body ? new Response(body) : new Response("not found", { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(async () => {
  vi.unstubAllGlobals();
  await stopJobs(2_000);
});

describe("разбор XML ЦБ", () => {
  it("читает windows-1251, десятичную запятую и номинал", () => {
    const parsed = parseCbrXml(cbrXml("17.10.2030", [["USD", 1, "Доллар США", "81,4567"], ["JPY", 100, "Иен", "54,3210"], ["KZT", 100, "Тенге", "15,1"]]));
    expect(parsed).toEqual({
      date: "2030-10-17",
      rates: [{ currency: "USD", rateRub: "81.456700" }, { currency: "JPY", rateRub: "0.543210" }, { currency: "KZT", rateRub: "0.151000" }],
    });
  });

  it("ответ без даты или без курсов — ошибка", () => {
    expect(() => parseCbrXml(encode1251("<html>Сервис недоступен</html>"))).toThrow();
    expect(() => parseCbrXml(cbrXml("17.10.2030", []))).toThrow();
  });
});

describe("загрузка курсов", () => {
  it("сохраняет курсы на сегодня и завтра и досчитывает amount_rub валютных операций", async () => {
    const user = await registerUser();
    const [account] = await db.insert(accounts).values({ userId: user.id, accountName: "Доллары", kind: "current", currency: "USD", balance: "0" }).returning();
    const [tx] = await db.insert(transactions).values({
      userId: user.id, accountId: account.id, type: "expense", amount: "-10.00", currency: "USD", description: "тест",
      transactionDate: new Date("2030-01-02T12:00:00Z"), localDate: "2030-01-02",
    }).returning();
    expect(tx.amountRub).toBeNull();

    stubCbr({
      "02/01/2030": cbrXml("02.01.2030", [["USD", 1, "Доллар США", "90,5055"]]),
      "03/01/2030": cbrXml("03.01.2030", [["USD", 1, "Доллар США", "91,0000"]]),
    });
    const result = await syncDailyRates(new Date("2030-01-02T13:00:00Z"));
    expect(result.saved).toBe(2);
    const rates = await db.select().from(fxRates).where(eq(fxRates.currency, "USD"));
    expect(rates.find((rate) => rate.date === "2030-01-03")?.rateRub).toBe("91.000000");

    const [updated] = await db.select().from(transactions).where(eq(transactions.id, tx.id));
    expect(updated.amountRub).toBe("-905.06"); // −10 × 90,5055 = −905,055 → от нуля до копейки
  });

  it("повторная загрузка обновляет курс той же даты", async () => {
    stubCbr({ "05/01/2030": cbrXml("05.01.2030", [["EUR", 1, "Евро", "99,0000"]]), "06/01/2030": cbrXml("05.01.2030", [["EUR", 1, "Евро", "99,0000"]]) });
    await syncDailyRates(new Date("2030-01-05T13:00:00Z"));
    stubCbr({ "05/01/2030": cbrXml("05.01.2030", [["EUR", 1, "Евро", "98,5000"]]), "06/01/2030": cbrXml("05.01.2030", [["EUR", 1, "Евро", "98,5000"]]) });
    await syncDailyRates(new Date("2030-01-05T13:00:00Z"));
    const [rate] = await db.select().from(fxRates).where(and(eq(fxRates.currency, "EUR"), eq(fxRates.date, "2030-01-05")));
    expect(rate.rateRub).toBe("98.500000");
  });

  it("ЦБ недоступен — ошибка, чтобы pg-boss повторил задачу", async () => {
    stubCbr({});
    await expect(syncDailyRates(new Date("2030-02-01T13:00:00Z"))).rejects.toThrow("ЦБ ответил 404");
  });
});

describe("начальное заполнение", () => {
  it("загружает пропущенные даты, выходные не дублирует, повторный запуск не ходит в ЦБ", async () => {
    await db.delete(fxRates).where(between(fxRates.date, "2030-03-06", "2030-03-10")); // база тестов не очищается между запусками
    const friday = cbrXml("08.03.2030", [["GBP", 1, "Фунт", "110,0000"]]);
    const fetchMock = stubCbr({
      "07/03/2030": cbrXml("07.03.2030", [["GBP", 1, "Фунт", "109,0000"]]),
      "08/03/2030": friday,
      "09/03/2030": friday, // суббота
      "10/03/2030": friday, // воскресенье
    });
    const loaded = await backfillRates(3, 0, new Date("2030-03-10T10:00:00Z"));
    expect(loaded).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(4);

    fetchMock.mockClear();
    await backfillRates(3, 0, new Date("2030-03-10T10:00:00Z"));
    // 07 и 08 уже есть; 09 и 10 — выходные без своей даты в ЦБ, их снова спрашиваем, но ничего не пишем
    expect(fetchMock.mock.calls.map(([url]) => new URL(String(url)).searchParams.get("date_req"))).toEqual(["09/03/2030", "10/03/2030"]);
  });
});

describe("расписание", () => {
  it("ежедневная задача в 16:00 по Москве ставит начальное заполнение, пока истории мало", async () => {
    expect(jobDefinitions.find((job) => job.name === "fx.rates.daily")?.cron).toBe("0 16 * * *");
    await startJobs("off");
    const today = new Date().toISOString().slice(0, 10);
    const [y, m, d] = today.split("-");
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10).split("-");
    stubCbr({
      [`${d}/${m}/${y}`]: cbrXml(`${d}.${m}.${y}`, [["CHF", 1, "Франк", "100,0000"]]),
      [`${tomorrow[2]}/${tomorrow[1]}/${tomorrow[0]}`]: cbrXml(`${d}.${m}.${y}`, [["CHF", 1, "Франк", "100,0000"]]),
    });
    await jobDefinitions.find((job) => job.name === "fx.rates.daily")!.handler({});
    const queued = await jobsBoss()!.findJobs("fx.rates.backfill");
    expect(queued.length).toBeGreaterThan(0);
  });
});
