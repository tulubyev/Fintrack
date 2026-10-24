/**
 * Нормализация мерчанта (E1.3-T5): строка из выписки («YANDEX*4121*GO», «PYATEROCHKA 4021 MOSCOW RUS») → название
 * мерчанта и категория по умолчанию из глобального словаря merchant_dictionary. Словарь меняется только миграциями
 * и читается один раз за жизнь процесса.
 */
import { db, merchantDictionary } from "@workspace/db";

export interface MerchantMatch {
  merchantName: string;
  categoryCode: string | null;
}

interface Entry extends MerchantMatch {
  pattern: string;
  op: string;
  priority: number;
  regex: RegExp | null;
}

/**
 * Нижний регистр, ё → е, без апострофов, всё кроме букв и цифр — пробел, буквы и цифры разделены пробелом
 * («4LAPY» → «4 lapy», «36,6» → «36 6»). Так же нормализованы шаблоны словаря.
 */
export function normalizeMerchantText(value: string): string {
  return value.toLowerCase().replace(/ё/g, "е").replace(/['’`]/g, "")
    .replace(/[^a-z0-9а-я]+/g, " ")
    .replace(/(?<=[a-zа-я])(?=\d)|(?<=\d)(?=[a-zа-я])/g, " ")
    .replace(/\s+/g, " ").trim();
}

// слова, которые не отличают одного мерчанта от другого: страна, город, форма собственности, «оплата товаров»
const NOISE = new Set([
  "rus", "ru", "rf", "russia", "moscow", "moskva", "msk", "spb", "sankt", "peterburg", "petersburg", "st", "g",
  "москва", "спб", "санкт", "петербург", "г", "oplata", "pokupka", "оплата", "покупка", "товаров", "услуг", "и",
  "www", "com", "ooo", "ооо", "ip", "ип", "zao", "зао", "ao", "ао", "pao", "пао", "oao", "оао", "mcc",
]);

/** Ключ мерчанта, которого нет в словаре: строка без шума и номеров — для группировки «Без категории» и правил. */
export function merchantKey(value: string): string {
  return normalizeMerchantText(value).split(" ").filter((token) => token && !NOISE.has(token) && !/^\d+$/.test(token)).slice(0, 6).join(" ");
}

let cache: Promise<Entry[]> | null = null;

function load() {
  cache ??= db.select().from(merchantDictionary).then((rows) => rows.map((row) => {
    let regex: RegExp | null = null;
    if (row.op === "regex") {
      try { regex = new RegExp(row.pattern); } catch { regex = null; } // битый шаблон не должен ронять категоризацию
    }
    return { pattern: row.pattern, op: row.op, priority: row.priority, merchantName: row.merchantName, categoryCode: row.categoryCode, regex };
  })).catch((error) => {
    cache = null;
    throw error;
  });
  return cache;
}

/** Сбрасывает прочитанный словарь — для тестов. */
export function invalidateMerchantDictionary() {
  cache = null;
}

function matches(entry: Entry, text: string): boolean {
  if (entry.op === "regex") return entry.regex?.test(text) ?? false;
  const padded = ` ${text} `;
  return entry.op === "starts_with" ? padded.startsWith(` ${entry.pattern} `) : padded.includes(` ${entry.pattern} `);
}

/**
 * Мерчант по строкам операции в порядке надёжности (обычно мерчант, затем описание): первая строка, где нашлось
 * совпадение, решает. Номера терминалов и MCC внутри строки («YANDEX*4121*GO») не мешают: строка проверяется
 * и без чисел.
 */
export async function matchMerchant(...values: Array<string | null | undefined>): Promise<MerchantMatch | null> {
  const entries = await load();
  for (const value of values) {
    if (!value) continue;
    const text = normalizeMerchantText(value);
    if (!text) continue;
    const variants = [text, text.split(" ").filter((token) => !/^\d+$/.test(token)).join(" ")];
    let best: Entry | null = null;
    for (const entry of entries) {
      if (!variants.some((variant) => matches(entry, variant))) continue;
      if (!best || entry.priority < best.priority || (entry.priority === best.priority && entry.pattern.length > best.pattern.length)) best = entry;
    }
    if (best) return { merchantName: best.merchantName, categoryCode: best.categoryCode };
  }
  return null;
}
