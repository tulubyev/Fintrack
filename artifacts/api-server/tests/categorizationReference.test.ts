/**
 * Справочники MCC и категорий банков (E1.3-T4): объём, ссылки на существующие системные категории нужного вида,
 * поиск с нормализацией названий.
 */
import { describe, expect, it } from "vitest";
import { and, isNull } from "drizzle-orm";
import { db, bankCategoryMap, categories, mccCodes } from "@workspace/db";
import { INSTITUTION_CODES } from "../src/lib/institutions";
import { bankCategory, mccCategory, normalizeText } from "../src/services/categorization/reference";

const systemKinds = async () =>
  new Map((await db.select().from(categories).where(and(isNull(categories.userId), isNull(categories.deletedAt)))).map((c) => [c.code!, c.kind]));

describe("справочник MCC", () => {
  it("не меньше 300 кодов, все ведут на системную категорию расходов, уверенность от 0 до 1", async () => {
    const rows = await db.select().from(mccCodes);
    expect(rows.length).toBeGreaterThanOrEqual(300);
    const kinds = await systemKinds();
    const broken = rows.filter((r) => kinds.get(r.categoryCode) !== "expense" || r.confidence <= 0 || r.confidence > 1 || !/^\d{4}$/.test(r.code));
    expect(broken.map((r) => `${r.code}→${r.categoryCode}`)).toEqual([]);
  });

  it("привязки из спецификации; двусмысленные коды — с низкой уверенностью", async () => {
    const expected: Record<string, string> = {
      "5411": "food.groceries", "5921": "food.alcohol", "5812": "eat.restaurant", "5814": "eat.fastfood", "4121": "transport.taxi",
      "5541": "auto.fuel", "5912": "health.pharmacy", "8021": "health.dental", "7997": "sport.fitness", "4814": "telecom.mobile",
      "6011": "cash", "9311": "finance.taxes", "3015": "travel.transport", "3700": "travel.hotel", "0742": "pets",
    };
    for (const [code, category] of Object.entries(expected)) expect((await mccCategory(code))?.categoryCode, code).toBe(category);
    for (const code of ["5311", "5399", "4829", "6012", "6538"]) expect((await mccCategory(code))!.confidence, code).toBeLessThan(0.5);
  });

  it("4112: дорогой билет — поездка, дешёвый — общественный транспорт; мусор и неизвестный код — null", async () => {
    expect((await mccCategory("4112", 3500))?.categoryCode).toBe("travel.transport");
    expect((await mccCategory("4112", 120))?.categoryCode).toBe("transport.public");
    expect((await mccCategory(" 5411 "))?.categoryCode).toBe("food.groceries");
    for (const value of [null, undefined, "", "54", "abcd", "0001"]) expect(await mccCategory(value)).toBeNull();
  });
});

describe("категории банков", () => {
  it("все строки ведут на системную категорию вида, совпадающего с направлением; банки из справочника банков", async () => {
    const rows = await db.select().from(bankCategoryMap);
    const kinds = await systemKinds();
    const broken = rows.filter((r) =>
      kinds.get(r.categoryCode) !== (r.direction === "in" ? "income" : "expense")
      || r.bankCategory !== normalizeText(r.bankCategory)
      || !(r.institutionCode === "any" || (INSTITUTION_CODES as readonly string[]).includes(r.institutionCode)));
    expect(broken.map((r) => `${r.institutionCode}/${r.bankCategory}/${r.direction}→${r.categoryCode}`)).toEqual([]);
    for (const bank of ["sber", "tbank", "alfa", "vtb", "ozon", "yandex"]) expect(rows.some((r) => r.institutionCode === bank), bank).toBe(true);
  });

  it("словарь банка важнее общего, направление различается, название нормализуется", async () => {
    expect(await bankCategory("sber", "Коммунальные платежи, связь, интернет.", "out")).toMatchObject({ categoryCode: "home.utilities" });
    expect((await bankCategory("sber", "Рестораны и кафе", "out"))?.categoryCode).toBe("eat");
    expect((await bankCategory("tbank", "Рестораны", "out"))?.categoryCode).toBe("eat.restaurant"); // общий словарь
    expect((await bankCategory("sber", "Всё для дома", "out"))?.categoryCode).toBe("home.goods");
    expect((await bankCategory("sber", "Перевод СБП", "out"))?.categoryCode).toBe("p2p");
    expect((await bankCategory("sber", "Перевод СБП", "in"))?.categoryCode).toBe("inc.p2p");
    expect((await bankCategory(null, "  КЭШБЭК ", "in"))?.categoryCode).toBe("inc.cashback");
    expect(await bankCategory("sber", "Зарплата", "out")).toBeNull();
    expect(await bankCategory("sber", "Неизвестная категория", "out")).toBeNull();
    expect(await bankCategory("sber", null, "out")).toBeNull();
  });
});
