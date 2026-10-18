/**
 * Курсы ЦБ РФ (E1.1-T2): загрузка XML_daily, хранение в fx_rates, досчёт amount_rub валютных операций.
 * Формат ЦБ: windows-1251, десятичная запятая, курс за Nominal единиц (у иены и тенге — за 100).
 */
import { sql } from "drizzle-orm";
import { fxRates } from "@shared/schema";
import { db } from "../db";
import { logger } from "./logger";

const CBR_DAILY_URL = "https://www.cbr.ru/scripts/XML_daily.asp";

export interface CbrRates {
  date: string; // дата, на которую ЦБ установил курсы (ValCurs Date), YYYY-MM-DD
  rates: Array<{ currency: string; rateRub: string }>;
}

/** "81,4567" за 100 единиц → "0.814567" (6 знаков, как numeric(18,6)), без потерь двоичной дроби. */
function perUnit(value: string, nominal: string): string {
  const [whole, fraction = ""] = value.trim().replace(",", ".").split(".");
  const micro = BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0").slice(0, 6));
  const divisor = BigInt(nominal.trim());
  const rounded = (micro + divisor / 2n) / divisor; // курсы положительные: округление половиной вверх
  return `${rounded / 1_000_000n}.${String(rounded % 1_000_000n).padStart(6, "0")}`;
}

const tag = (block: string, name: string) => new RegExp(`<${name}>([^<]*)</${name}>`).exec(block)?.[1];

export function parseCbrXml(body: ArrayBuffer | Uint8Array): CbrRates {
  const text = new TextDecoder("windows-1251").decode(body);
  const dateMatch = /<ValCurs[^>]*Date="(\d{2})\.(\d{2})\.(\d{4})"/.exec(text);
  if (!dateMatch) throw new Error("Ответ ЦБ без даты курсов");
  const rates: CbrRates["rates"] = [];
  for (const [, block] of text.matchAll(/<Valute\b[^>]*>([\s\S]*?)<\/Valute>/g)) {
    const currency = tag(block, "CharCode");
    const nominal = tag(block, "Nominal");
    const value = tag(block, "Value");
    if (!currency || !nominal || !value || !/^[A-Z]{3}$/.test(currency)) continue;
    rates.push({ currency, rateRub: perUnit(value, nominal) });
  }
  if (!rates.length) throw new Error("Ответ ЦБ без курсов");
  return { date: `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`, rates };
}

/** Курсы на дату (по умолчанию — ближайшие установленные ЦБ). */
export async function fetchCbrRates(date?: string): Promise<CbrRates> {
  const url = new URL(CBR_DAILY_URL);
  if (date) {
    const [year, month, day] = date.split("-");
    url.searchParams.set("date_req", `${day}/${month}/${year}`);
  }
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`ЦБ ответил ${response.status}`);
  return parseCbrXml(await response.arrayBuffer());
}

export async function saveRates({ date, rates }: CbrRates): Promise<number> {
  if (!rates.length) return 0;
  await db.insert(fxRates).values(rates.map((rate) => ({ date, currency: rate.currency, rateRub: rate.rateRub, source: "cbr" })))
    .onConflictDoUpdate({ target: [fxRates.date, fxRates.currency], set: { rateRub: sql`excluded.rate_rub` } });
  return rates.length;
}

/**
 * Досчитывает amount_rub у валютных операций, для которых не было курса: берётся последний курс
 * не позже даты операции, округление до копейки от нуля (как convertByRate в lib/money).
 */
export async function fillMissingAmountRub(): Promise<number> {
  const result = await db.execute(sql`
    UPDATE transactions t SET amount_rub = round(t.amount * r.rate_rub, 2), updated_at = now()
    FROM (
      SELECT p.id, (
        SELECT f.rate_rub FROM fx_rates f
        WHERE f.currency = p.currency AND f.date <= p.local_date
        ORDER BY f.date DESC LIMIT 1
      ) AS rate_rub
      FROM transactions p
      WHERE p.amount_rub IS NULL AND coalesce(p.currency, 'RUB') <> 'RUB' AND p.deleted_at IS NULL
    ) r
    WHERE t.id = r.id AND r.rate_rub IS NOT NULL
  `);
  return result.rowCount ?? 0;
}

/** Сколько дат с курсами уже загружено (рабочих дней ЦБ). */
export async function countRateDates(): Promise<number> {
  const { rows } = await db.execute<{ count: number }>(sql`SELECT count(DISTINCT date)::int AS count FROM fx_rates`);
  return rows[0]?.count ?? 0;
}

const isoDay = (date: Date) => date.toISOString().slice(0, 10);

/** Ежедневно: курсы на сегодня и на завтра (ЦБ публикует завтрашние после обеда), затем досчёт amount_rub. */
export async function syncDailyRates(now = new Date()): Promise<{ saved: number; filled: number }> {
  let saved = 0;
  for (const offset of [0, 1]) {
    const day = isoDay(new Date(now.getTime() + offset * 86_400_000));
    const rates = await fetchCbrRates(day);
    // на выходные и праздники ЦБ возвращает последние установленные курсы с их собственной датой
    saved += await saveRates(rates);
  }
  const filled = await fillMissingAmountRub();
  logger.info(`fx.rates.daily: сохранено курсов ${saved}, досчитано amount_rub ${filled}`);
  return { saved, filled };
}

/**
 * Начальное заполнение: курсы за последние `days` дней, по одному запросу в день с паузой,
 * чтобы не нагружать ЦБ. Уже загруженные даты пропускаются — задачу можно перезапускать.
 */
export async function backfillRates(days: number, pauseMs = 500, now = new Date()): Promise<number> {
  const { rows } = await db.execute<{ date: string }>(sql`SELECT DISTINCT date::text AS date FROM fx_rates`);
  const known = new Set(rows.map((row) => row.date));
  let loaded = 0;
  for (let offset = days; offset >= 0; offset--) {
    const day = isoDay(new Date(now.getTime() - offset * 86_400_000));
    if (known.has(day)) continue;
    const rates = await fetchCbrRates(day);
    if (!known.has(rates.date)) {
      await saveRates(rates);
      known.add(rates.date);
      loaded++;
    }
    if (pauseMs) await new Promise((resolve) => setTimeout(resolve, pauseMs));
  }
  await fillMissingAmountRub();
  logger.info(`fx.rates.backfill: загружено дат ${loaded}`);
  return loaded;
}
