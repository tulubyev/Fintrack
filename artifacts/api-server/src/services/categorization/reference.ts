/**
 * Справочники автокатегоризации (E1.3-T4): MCC и категории банков → код нашей категории с уверенностью.
 * Справочники меняются только миграциями, поэтому читаются один раз за жизнь процесса (выкатка перезапускает его).
 */
import { db, bankCategoryMap, mccCodes } from "@workspace/db";

export interface ReferenceMatch {
  categoryCode: string;
  confidence: number;
}

// у категории банка нет оттенков уверенности: банк сам разметил операцию по своему справочнику
const BANK_CONFIDENCE = 0.8;
// 4112 — и электрички, и поезда дальнего следования: дорогой билет считаем поездкой
const LONG_DISTANCE_RAIL_RUB = 2000;

/** Нижний регистр, ё → е, одиночные пробелы, без точек в конце — так хранятся названия в справочниках. */
export function normalizeText(value: string): string {
  return value.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim().replace(/\.+$/, "").trim();
}

let cache: Promise<{ mcc: Map<string, ReferenceMatch>; bank: Map<string, string> }> | null = null;
const bankKey = (institution: string, category: string, direction: "in" | "out") => `${institution}|${direction}|${category}`;

function load() {
  cache ??= (async () => {
    const [mccRows, bankRows] = await Promise.all([db.select().from(mccCodes), db.select().from(bankCategoryMap)]);
    return {
      mcc: new Map(mccRows.map((row) => [row.code, { categoryCode: row.categoryCode, confidence: row.confidence }])),
      bank: new Map(bankRows.map((row) => [bankKey(row.institutionCode, row.bankCategory, row.direction as "in" | "out"), row.categoryCode])),
    };
  })().catch((error) => {
    cache = null; // не запоминаем сбой чтения — следующий вызов попробует снова
    throw error;
  });
  return cache;
}

/** Категория по MCC; amountRub — модуль суммы в рублях, нужен для 4112 (электричка или поезд). */
export async function mccCategory(mcc: string | null | undefined, amountRub?: number): Promise<ReferenceMatch | null> {
  const code = mcc?.trim();
  if (!code || !/^\d{4}$/.test(code)) return null;
  const match = (await load()).mcc.get(code);
  if (!match) return null;
  if (code === "4112" && amountRub !== undefined && amountRub > LONG_DISTANCE_RAIL_RUB) return { categoryCode: "travel.transport", confidence: 0.7 };
  return match;
}

/** Категория по названию категории банка: сначала словарь этого банка, затем общий ('any'). */
export async function bankCategory(institutionCode: string | null | undefined, name: string | null | undefined, direction: "in" | "out"): Promise<ReferenceMatch | null> {
  if (!name) return null;
  const normalized = normalizeText(name);
  if (!normalized) return null;
  const { bank } = await load();
  const code = (institutionCode && bank.get(bankKey(institutionCode, normalized, direction))) || bank.get(bankKey("any", normalized, direction));
  return code ? { categoryCode: code, confidence: BANK_CONFIDENCE } : null;
}
