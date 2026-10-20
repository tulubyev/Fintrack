/**
 * Детектор регулярных платежей (E1.6-T2): синтетический набор сценариев из критериев приёмки.
 * Чистая функция — без базы; справочник сервисов — фрагмент сида миграции 0010.
 */
import { describe, expect, it } from "vitest";
import {
  addDays, addMonths, detectSeries, groupKeyOf, matchService, normalizeText, type Candidate, type DetectedSeries, type ServiceRef,
} from "../src/services/recurring/detector";

const TODAY = "2026-10-20";

const SERVICES: ServiceRef[] = [
  { id: "s-plus", code: "yandex_plus", name: "Яндекс Плюс", serviceGroup: "bundle", patterns: ["yandex plus", "plus yandex", "яндекс плюс"], trialDays: 30 },
  { id: "s-okko", code: "okko", name: "Okko", serviceGroup: "video", patterns: ["okko", "окко"], trialDays: 14 },
  { id: "s-kp", code: "kinopoisk", name: "Кинопоиск", serviceGroup: "video", patterns: ["kinopoisk"], trialDays: 30 },
  { id: "s-kasp", code: "kaspersky", name: "Kaspersky", serviceGroup: "software", patterns: ["kaspersky"], trialDays: 30 },
  { id: "s-mts", code: "mts", name: "МТС", serviceGroup: "telecom", patterns: ["mts", "мтс"], trialDays: null },
  { id: "s-mtsp", code: "mts_premium", name: "МТС Premium", serviceGroup: "bundle", patterns: ["mts premium"], trialDays: 30 },
  { id: "s-apple", code: "apple", name: "Подписки App Store", serviceGroup: "store", patterns: ["apple com bill", "apple com"], trialDays: null },
  { id: "s-t2", code: "t2", name: "T2 (Tele2)", serviceGroup: "telecom", patterns: ["tele2", "t2"], trialDays: null },
];

let seq = 0;
interface Op { date: string; amount: string; description: string; merchant?: string | null; type?: "expense" | "income"; code?: string | null; currency?: string }
const op = (o: Op): Candidate => ({
  id: `tx-${++seq}`,
  accountId: "acc-1",
  type: o.type ?? (o.amount.startsWith("-") ? "expense" : "income"),
  amount: o.amount,
  currency: o.currency ?? "RUB",
  date: o.date,
  description: o.description,
  merchant: o.merchant ?? null,
  merchantNormalized: null,
  categoryId: o.code ? `cat-${o.code}` : null,
  categoryCode: o.code ?? null,
});

/** n операций с шагом месяц назад от последней даты */
function monthly(last: string, n: number, amount: string | ((i: number) => string), description: string, extra: Partial<Op> = {}): Candidate[] {
  return Array.from({ length: n }, (_, i) => op({
    date: addMonths(last, -(n - 1 - i)),
    amount: typeof amount === "function" ? amount(i) : amount,
    description,
    ...extra,
  }));
}
function everyDays(last: string, n: number, step: number, amount: string, description: string, extra: Partial<Op> = {}): Candidate[] {
  return Array.from({ length: n }, (_, i) => op({ date: addDays(last, -(n - 1 - i) * step), amount, description, ...extra }));
}

const detect = (ops: Candidate[]) => detectSeries(ops, SERVICES, TODAY);
const one = (ops: Candidate[]): DetectedSeries => {
  const result = detect(ops);
  expect(result, JSON.stringify(result.map((s) => [s.groupKey, s.kind]))).toHaveLength(1);
  return result[0];
};

describe("нормализация и справочник", () => {
  it("номера терминалов и масок убираются, короткие числа остаются", () => {
    expect(normalizeText("YANDEX*5815*PLUS")).toBe("yandex plus");
    expect(normalizeText("Ёлка.Ру TELE2 360")).toBe("елка ру tele2 360");
    expect(groupKeyOf({ merchant: null, merchantNormalized: null, description: "Оплата ЖКУ л/с 123456 за 09.2026" })).toBe("оплата жку л с за");
  });
  it("сервис — по самому длинному паттерну целыми словами", () => {
    expect(matchService("MTS PREMIUM MOSCOW", SERVICES)?.code).toBe("mts_premium");
    expect(matchService("MTS", SERVICES)?.code).toBe("mts");
    expect(matchService("SMTSHOP", SERVICES)).toBeNull();
  });
});

describe("сценарии", () => {
  it("1. Яндекс Плюс 299 ₽ каждый месяц — подписка, сервис, следующее списание через месяц", () => {
    const s = one(monthly("2026-10-05", 6, "-299.00", "YANDEX*5815*PLUS"));
    expect(s).toMatchObject({ kind: "subscription", serviceId: "s-plus", periodicity: "monthly", displayName: "Яндекс Плюс", occurrences: 6, nextExpectedDate: "2026-11-05", ended: false });
    expect(s.amountLast).toBe(29900n);
    expect(s.confidence).toBeGreaterThan(0.9);
  });

  it("2. Неизвестный сервис в категории подписок — подписка без сервиса", () => {
    expect(one(monthly("2026-10-12", 4, "-990.00", "NOTION LABS", { code: "subs.software" }))).toMatchObject({ kind: "subscription", serviceId: null });
  });

  it("3. Годовая подписка из справочника — по двум списаниям", () => {
    const s = one([op({ date: "2025-03-01", amount: "-2490.00", description: "KASPERSKY LAB" }), op({ date: "2026-03-02", amount: "-2490.00", description: "KASPERSKY LAB" })]);
    expect(s).toMatchObject({ kind: "subscription", periodicity: "yearly", nextExpectedDate: "2027-03-02" });
  });

  it("4. Два годовых платежа неизвестному получателю — мало данных", () => {
    expect(detect([op({ date: "2025-03-01", amount: "-5000.00", description: "STRAHOVKA" }), op({ date: "2026-03-01", amount: "-5000.00", description: "STRAHOVKA" })])).toEqual([]);
  });

  it("5. ЖКУ с плавающей суммой — обязательный платёж", () => {
    const amounts = ["-4500.00", "-5200.00", "-6100.00", "-5800.00", "-4900.00"];
    expect(one(monthly("2026-10-10", 5, (i) => amounts[i], "ЕИРЦ ЖКУ л/с 7781234", { code: "home.utilities" }))).toMatchObject({ kind: "utility", periodicity: "monthly" });
  });

  it("6. Мобильная связь МТС — обязательный платёж, хотя сервис из справочника", () => {
    expect(one(monthly("2026-10-03", 5, "-550.00", "MTS"))).toMatchObject({ kind: "utility", serviceId: "s-mts" });
  });

  it("7. Погашение кредита — кредит", () => {
    expect(one(monthly("2026-10-15", 8, "-15430.00", "Погашение кредита по договору 1234567"))).toMatchObject({ kind: "loan" });
  });

  it("8. Зарплата раз в месяц — доход salary", () => {
    expect(one(monthly("2026-10-10", 6, "120000.00", "ООО Ромашка зарплата", { code: "inc.salary" }))).toMatchObject({ kind: "salary", direction: "in" });
  });

  it("9. Зарплата с премиями в пределах 60% — всё равно зарплата", () => {
    const amounts = ["100000.00", "130000.00", "110000.00", "125000.00"];
    expect(one(monthly("2026-10-10", 4, (i) => amounts[i], "Заработная плата"))).toMatchObject({ kind: "salary" });
  });

  it("10. Пенсия — доход pension", () => {
    expect(one(monthly("2026-10-04", 6, "23400.00", "Социальный фонд России", { code: "inc.pension" }))).toMatchObject({ kind: "pension", direction: "in" });
  });

  it("11. Аренда переводом человеку стабильной суммой — аренда", () => {
    expect(one(monthly("2026-10-01", 5, "-45000.00", "Перевод Иванову И. И.", { code: "p2p" }))).toMatchObject({ kind: "rent" });
  });

  it("12. Два обеда в одном кафе — не регулярный платёж", () => {
    expect(detect([op({ date: "2026-10-01", amount: "-650.00", description: "Кафе Пушкин" }), op({ date: "2026-10-15", amount: "-650.00", description: "Кафе Пушкин" })])).toEqual([]);
  });

  it("13. Частые такси с разными суммами — не регулярный платёж", () => {
    const dates = ["2026-09-01", "2026-09-03", "2026-09-04", "2026-09-10", "2026-09-11", "2026-09-20", "2026-09-29", "2026-10-02"];
    expect(detect(dates.map((date, i) => op({ date, amount: `-${300 + i * 140}.00`, description: "YANDEX.GO" })))).toEqual([]);
  });

  it("14. Кофе по абонементу каждую неделю — регулярный weekly", () => {
    expect(one(everyDays("2026-10-19", 8, 7, "-350.00", "COFFEE LIKE"))).toMatchObject({ periodicity: "weekly", kind: "other" });
  });

  it("15. Закончившаяся подписка — ended, без следующего списания", () => {
    expect(one(monthly("2026-06-05", 5, "-399.00", "OKKO"))).toMatchObject({ ended: true, nextExpectedDate: null, expectedAmount: null });
  });

  it("16. Пробный период за 1 ₽ — trial со списанием через trial_days", () => {
    expect(one([op({ date: "2026-10-15", amount: "-1.00", description: "OKKO" })])).toMatchObject({ kind: "trial", nextExpectedDate: "2026-10-29", serviceId: "s-okko" });
  });

  it("17. Пробный период прошёл без списания — серии нет", () => {
    expect(detect([op({ date: "2026-08-01", amount: "-1.00", description: "OKKO" })])).toEqual([]);
  });

  it("18. Пробный период, затем три списания — обычная подписка, пробное не мешает интервалам", () => {
    const ops = [op({ date: "2026-07-01", amount: "-1.00", description: "KINOPOISK" }), ...monthly("2026-10-31", 3, "-299.00", "KINOPOISK")];
    expect(one(ops)).toMatchObject({ kind: "subscription", occurrences: 3, periodicity: "monthly" });
  });

  it("19. Цена выросла 299 → 399 — серия не рвётся, прежняя цена и дата смены сохраняются", () => {
    const s = one(monthly("2026-10-05", 5, (i) => (i < 3 ? "-299.00" : "-399.00"), "YANDEX PLUS"));
    expect(s).toMatchObject({ kind: "subscription", amountPrevious: 29900n, amountLast: 39900n, priceChangedAt: "2026-09-05" });
  });

  it("20. Раз в квартал — quarterly", () => {
    const ops = [0, 1, 2, 3].map((i) => op({ date: addMonths("2026-10-01", -(3 - i) * 3), amount: "-3000.00", description: "Страхование квартиры" }));
    expect(one(ops)).toMatchObject({ periodicity: "quarterly", nextExpectedDate: "2027-01-01" });
  });

  it("21. Каждые две недели — biweekly", () => {
    expect(one(everyDays("2026-10-16", 6, 14, "-1200.00", "Уборка Чистый дом"))).toMatchObject({ periodicity: "biweekly" });
  });

  it("22. Нерегулярные интервалы (20, 40, 30, 25 дней) — не серия", () => {
    const dates = ["2026-05-01", "2026-05-21", "2026-06-30", "2026-07-30", "2026-08-24"];
    expect(detect(dates.map((date) => op({ date, amount: "-500.00", description: "Салон красоты" })))).toEqual([]);
  });

  it("23. Суммы гуляют больше 60% — не серия", () => {
    const amounts = ["-500.00", "-2500.00", "-900.00", "-4000.00"];
    expect(detect(monthly("2026-10-05", 4, (i) => amounts[i], "Магазин у дома"))).toEqual([]);
  });

  it("24. Разные номера терминала в описании — одна серия", () => {
    const ops = ["7718", "5815", "9911", "1204"].map((terminal, i) => op({ date: addMonths("2026-10-05", -(3 - i)), amount: "-299.00", description: `YANDEX*${terminal}*PLUS` }));
    expect(one(ops).occurrences).toBe(4);
  });

  it("25. Разные валюты не смешиваются", () => {
    const ops = [...monthly("2026-10-05", 3, "-10.00", "SPOTIFY", { currency: "USD" }), ...monthly("2026-10-06", 3, "-990.00", "SPOTIFY")];
    expect(detect(ops).map((s) => s.currency).sort()).toEqual(["RUB", "USD"]);
  });

  it("26. Доход и расход с одним названием — разные серии", () => {
    const ops = [...monthly("2026-10-05", 3, "-5000.00", "Иван Петров"), ...monthly("2026-10-20", 3, "5000.00", "Иван Петров")];
    expect(detect(ops).map((s) => s.direction).sort()).toEqual(["in", "out"]);
  });

  it("27. Конец месяца: 31.07, 31.08, 30.09 — следующее 30.10", () => {
    const ops = ["2026-07-31", "2026-08-31", "2026-09-30"].map((date) => op({ date, amount: "-799.00", description: "YANDEX PLUS" }));
    expect(one(ops).nextExpectedDate).toBe("2026-10-30");
  });

  it("28. Низкая уверенность (3 платежа, MAD 3 дня, разброс 55%) — не показывается", () => {
    // интервалы 33 и 27 (MAD 3), суммы 1000/1600/1100: разброс 600/1100 ≈ 0,55 → уверенность ≈ 0,596
    const ops = [op({ date: "2026-08-14", amount: "-1000.00", description: "Репетитор" }), op({ date: "2026-09-16", amount: "-1600.00", description: "Репетитор" }), op({ date: "2026-10-13", amount: "-1100.00", description: "Репетитор" })];
    expect(detect(ops)).toEqual([]);
    // тот же ряд со стабильной суммой — уверенность выше порога
    expect(detect(ops.map((o) => ({ ...o, amount: "-1100.00" })))).toHaveLength(1);
  });

  it("29. Два списания в один день — одно списание с суммой", () => {
    const ops = [...monthly("2026-10-05", 4, "-199.00", "APPLE.COM/BILL"), op({ date: "2026-10-05", amount: "-100.00", description: "APPLE.COM/BILL" })];
    const s = one(ops);
    expect(s).toMatchObject({ occurrences: 4, kind: "subscription", serviceId: "s-apple" });
    expect(s.amountLast).toBe(29900n);
    expect(s.transactionIds).toHaveLength(5);
  });

  it("30. Связь T2 «TELE2» с номером — сервис по короткому слову с цифрой", () => {
    expect(one(monthly("2026-10-08", 4, "-400.00", "TELE2 79991234567"))).toMatchObject({ serviceId: "s-t2", kind: "utility" });
  });

  it("31. Детектор на 20 000 операций — быстрее 5 с", () => {
    const ops: Candidate[] = [];
    for (let i = 0; i < 20_000; i++) {
      ops.push(op({ date: addDays(TODAY, -(i % 400)), amount: `-${100 + (i % 977)}.00`, description: `Магазин ${i % 600}` }));
    }
    ops.push(...monthly("2026-10-05", 12, "-299.00", "YANDEX PLUS"));
    const started = Date.now();
    const result = detect(ops);
    expect(Date.now() - started).toBeLessThan(5_000);
    expect(result.some((s) => s.serviceId === "s-plus")).toBe(true);
  });
});
