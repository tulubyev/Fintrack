/**
 * Словарь мерчантов и нормализация (E1.3-T5): объём, ссылки на системные категории расходов, шаблоны хранятся
 * нормализованными, разбор строк из реальных выписок, фамилии в переводах не превращаются в мерчантов.
 */
import { afterAll, describe, expect, it } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import { db, categories, merchantDictionary } from "@workspace/db";
import { invalidateMerchantDictionary, matchMerchant, merchantKey, normalizeMerchantText } from "../src/services/categorization/merchant";

describe("словарь", () => {
  it("не меньше 300 мерчантов; категории — системные расходы; шаблоны нормализованы", async () => {
    const rows = await db.select().from(merchantDictionary);
    expect(new Set(rows.map((r) => r.merchantName)).size).toBeGreaterThanOrEqual(300);
    const kinds = new Map((await db.select().from(categories).where(and(isNull(categories.userId), isNull(categories.deletedAt)))).map((c) => [c.code!, c.kind]));
    expect(rows.filter((r) => r.categoryCode !== null && kinds.get(r.categoryCode) !== "expense").map((r) => `${r.pattern}→${r.categoryCode}`)).toEqual([]);
    expect(rows.filter((r) => r.op !== "regex" && normalizeMerchantText(r.pattern) !== r.pattern).map((r) => r.pattern)).toEqual([]);
    // короткие шаблоны цепляют лишнее: не короче трёх символов
    expect(rows.filter((r) => r.pattern.replace(/ /g, "").length < 3).map((r) => r.pattern)).toEqual([]);
  });
});

describe("нормализация", () => {
  it("регистр, ё, апострофы, разделители, буквы и цифры", () => {
    expect(normalizeMerchantText("YANDEX*4121*GO")).toBe("yandex 4121 go");
    expect(normalizeMerchantText("O'STIN  Ёлки")).toBe("ostin елки");
    expect(normalizeMerchantText("4LAPY.RU")).toBe("4 lapy ru");
    expect(normalizeMerchantText("Аптека 36,6")).toBe("аптека 36 6");
  });

  it("ключ без словаря: без номеров, города, страны и «оплаты товаров»", () => {
    expect(merchantKey("IP SIDOROV A V 4021 MOSCOW RUS")).toBe("sidorov a v");
    expect(merchantKey("Оплата товаров и услуг. ООО Ромашка г. Тула")).toBe("ромашка тула");
  });
});

describe("сопоставление", () => {
  it("строки из выписок", async () => {
    const cases: Array<[string, string, string | null]> = [
      ["PYATEROCHKA 4021 MOSCOW RUS", "Пятёрочка", "food.groceries"],
      ["YANDEX*4121*GO", "Яндекс Go", "transport.taxi"],
      ["YANDEX.TAXI", "Яндекс Go", "transport.taxi"],
      ["YANDEX*5815*PLUS", "Яндекс Плюс", "subs.bundle"],
      ["MAGNIT MM KOSMETIK", "Магнит", "food.groceries"],
      ["MAGNIT KOSMETIK 1234", "Магнит Косметик", "beauty"],
      ["Магнит Маркет", "Магнит Маркет", "shopping.marketplace"],
      ["OZON.RU", "Ozon", "shopping.marketplace"],
      ["OZON BANK перевод", "Озон Банк", null],
      ["MTS PREMIUM", "МТС Premium", "subs.bundle"],
      ["MTS*MOBILE 495", "МТС", "telecom.mobile"],
      ["O'STIN TC EVROPEISKIY", "O'STIN", "clothes"],
      ["4LAPY 112", "Четыре лапы", "pets"],
      ["APTEKA 36,6 N 123", "36,6", "health.pharmacy"],
      ["Вкусно — и точка", "Вкусно — и точка", "eat.fastfood"],
      ["S7 AIRLINES", "S7 Airlines", "travel.transport"],
      ["LUKOIL AZS 77123", "Лукойл", "auto.fuel"],
    ];
    for (const [raw, name, category] of cases) expect(await matchMerchant(raw), raw).toEqual({ merchantName: name, categoryCode: category });
  });

  it("мерчант важнее описания; описание — если мерчант не узнан; фамилии и отчества не мерчанты", async () => {
    expect((await matchMerchant("PYATEROCHKA", "Оплата в Перекрёсток"))?.merchantName).toBe("Пятёрочка");
    expect((await matchMerchant("TERMINAL 12345", "Оплата в Перекрёсток"))?.merchantName).toBe("Перекрёсток");
    for (const raw of ["Перевод Соколов А.", "Иван Петрович К.", "Ему везет", "Фамилия получателя", null, "", "  "]) {
      expect(await matchMerchant(raw), String(raw)).toBeNull();
    }
  });
});

describe("шаблоны-регулярки и приоритет", () => {
  const added: string[] = [];
  afterAll(async () => {
    for (const id of added) await db.delete(merchantDictionary).where(eq(merchantDictionary.id, id));
    invalidateMerchantDictionary();
  });

  it("regex по нормализованной строке; меньший priority важнее длины; битая регулярка игнорируется", async () => {
    const rows = await db.insert(merchantDictionary).values([
      { pattern: "^tst \\d+ shop$", op: "regex", merchantName: "Тестовый магазин", categoryCode: "shopping.other" },
      { pattern: "tst priority", op: "contains", merchantName: "Приоритетный", categoryCode: "other", priority: 10 },
      { pattern: "tst priority long name", op: "contains", merchantName: "Длинный", categoryCode: "other" },
      { pattern: "([", op: "regex", merchantName: "Битый", categoryCode: "other" },
    ]).returning();
    added.push(...rows.map((r) => r.id));
    invalidateMerchantDictionary();
    expect((await matchMerchant("TST-42-SHOP"))?.merchantName).toBe("Тестовый магазин");
    expect((await matchMerchant("TST PRIORITY LONG NAME"))?.merchantName).toBe("Приоритетный");
  });
});
