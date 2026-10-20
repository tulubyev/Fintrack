/**
 * Детектор регулярных платежей и доходов (E1.6-T2): чистая функция над операциями пользователя.
 * Группирует по направлению, валюте и нормализованному описанию, по интервалам находит периодичность,
 * по разбросу сумм — стабильность (с учётом смены цены), определяет вид серии, уверенность и следующее списание.
 * Алгоритм и пороги — docs/product/epics/E1.6-recurring-subscriptions.md, раздел «Алгоритм детекции».
 */

export type Periodicity = "weekly" | "biweekly" | "monthly" | "quarterly" | "yearly";
export type SeriesKind = "subscription" | "utility" | "loan" | "rent" | "salary" | "pension" | "trial" | "other";

export interface Candidate {
  id: string;
  accountId: string;
  type: "expense" | "income";
  /** Сумма со знаком, как в БД: «-299.00» */
  amount: string;
  currency: string;
  /** local_date, YYYY-MM-DD */
  date: string;
  description: string;
  merchant: string | null;
  merchantNormalized: string | null;
  categoryId: string | null;
  /** Код системной категории (у своей категории — код родителя) */
  categoryCode: string | null;
}

export interface ServiceRef {
  id: string;
  code: string;
  name: string;
  serviceGroup: string;
  patterns: string[];
  trialDays: number | null;
}

export interface DetectedSeries {
  groupKey: string;
  displayName: string;
  direction: "out" | "in";
  kind: SeriesKind;
  serviceId: string | null;
  accountId: string;
  categoryId: string | null;
  currency: string;
  periodicity: Periodicity;
  intervalDays: number;
  /** Суммы — по модулю, в копейках */
  amountLast: bigint;
  amountMedian: bigint;
  amountMin: bigint;
  amountMax: bigint;
  amountPrevious: bigint | null;
  priceChangedAt: string | null;
  occurrences: number;
  firstDate: string;
  lastDate: string;
  nextExpectedDate: string | null;
  expectedAmount: bigint | null;
  confidence: number;
  ended: boolean;
  transactionIds: string[];
}

export const CONFIDENCE_THRESHOLD = 0.6;
const TRIAL_MAX = 1000n; // пробное списание — до 10 ₽
const PRICE_STEP = 0.05; // скачок суммы больше 5% — кандидат на смену цены
const STABLE = 0.15;
const VARIABLE = 0.6;

// ---------- текст ----------

/**
 * «YANDEX*5815*PLUS» → «yandex plus». Строчные, ё → е, всё кроме букв и цифр — пробел,
 * номера из 4+ цифр (терминалы, маски карт) убираются; короткие числа остаются: «tele2», «360».
 */
export function normalizeText(value: string): string {
  return value.toLowerCase().replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9]+/g, " ")
    .split(" ")
    .filter((token) => token && !/^\d{4,}$/.test(token))
    .join(" ");
}

/** Ключ группировки: нормализованный мерчант или описание без чисел (даты, номера договоров). */
export function groupKeyOf(candidate: Pick<Candidate, "merchant" | "merchantNormalized" | "description">): string {
  const source = candidate.merchantNormalized || candidate.merchant || candidate.description;
  return normalizeText(source).split(" ").filter((token) => token && !/^\d+$/.test(token)).join(" ").slice(0, 160);
}

/** Сервис из справочника по самому длинному совпавшему паттерну (целыми словами). */
export function matchService(text: string, services: ServiceRef[]): ServiceRef | null {
  const haystack = ` ${normalizeText(text)} `;
  let best: { service: ServiceRef; length: number } | null = null;
  for (const service of services) {
    for (const pattern of service.patterns) {
      if (haystack.includes(` ${pattern} `) && (!best || pattern.length > best.length)) best = { service, length: pattern.length };
    }
  }
  return best?.service ?? null;
}

// ---------- даты и числа ----------

const DAY = 86_400_000;
const toTime = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
export const daysBetween = (from: string, to: string) => Math.round((toTime(to) - toTime(from)) / DAY);
export function addDays(iso: string, days: number): string {
  return new Date(toTime(iso) + days * DAY).toISOString().slice(0, 10);
}
/** 31 января + 1 месяц → 28/29 февраля */
export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const last = new Date(Date.UTC(y, m - 1 + months + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1 + months, Math.min(d, last))).toISOString().slice(0, 10);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
function medianBig(values: bigint[]): bigint {
  const sorted = [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2n;
}
const absKopecks = (amount: string) => {
  const [whole, fraction = ""] = amount.replace("-", "").split(".");
  return BigInt(whole) * 100n + BigInt((fraction + "00").slice(0, 2));
};
/** (max − min) / median */
function spread(values: bigint[]): number {
  const med = medianBig(values);
  if (med === 0n) return Infinity;
  const max = values.reduce((a, b) => (b > a ? b : a));
  const min = values.reduce((a, b) => (b < a ? b : a));
  return Number(max - min) / Number(med);
}

function periodicityOf(m: number): Periodicity | null {
  if (m >= 6 && m <= 8) return "weekly";
  if (m >= 13 && m <= 16) return "biweekly";
  if (m >= 27 && m <= 33) return "monthly";
  if (m >= 85 && m <= 95) return "quarterly";
  if (m >= 350 && m <= 380) return "yearly";
  return null;
}

function nextDate(last: string, periodicity: Periodicity): string {
  switch (periodicity) {
    case "weekly": return addDays(last, 7);
    case "biweekly": return addDays(last, 14);
    case "monthly": return addMonths(last, 1);
    case "quarterly": return addMonths(last, 3);
    case "yearly": return addMonths(last, 12);
  }
}

// ---------- вид серии ----------

const LOAN_WORDS = ["погашени", "кредит", "ипотек", "loan"];
const SALARY_WORDS = ["зарплат", "заработн", "аванс", "salary"];
const PENSION_WORDS = ["пенси", "сфр", "пфр", "социальный фонд", "пособи"];
const RENT_WORDS = ["аренд", "найм"];
const P2P_WORDS = ["перевод", "сбп"];

const hasWord = (text: string, words: string[]) => words.some((word) => text.includes(word));

function kindOf(direction: "out" | "in", code: string | null, text: string, service: ServiceRef | null, stable: boolean): SeriesKind {
  if (direction === "in") {
    if (code === "inc.salary" || hasWord(text, SALARY_WORDS)) return "salary";
    if (code === "inc.pension" || code === "inc.benefits" || hasWord(text, PENSION_WORDS)) return "pension";
    return "other";
  }
  if (service) return service.serviceGroup === "telecom" ? "utility" : "subscription";
  if (code?.startsWith("subs")) return stable ? "subscription" : "utility";
  if (code === "home.utilities" || code?.startsWith("telecom")) return "utility";
  if (code === "finance.interest" || hasWord(text, LOAN_WORDS)) return "loan";
  if (code === "home.rent" || hasWord(text, RENT_WORDS)) return "rent";
  if ((code === "p2p" || code?.startsWith("p2p.") || hasWord(text, P2P_WORDS)) && stable) return "rent";
  // сумма гуляет в пределах 60% — так ведут себя ЖКУ и связь
  return stable ? "other" : "utility";
}

// ---------- детекция ----------

interface Occurrence {
  date: string;
  amount: bigint;
  ids: string[];
  last: Candidate;
}

/** Несколько операций одной группы в один день — одно списание с суммой. */
function occurrencesOf(items: Candidate[]): Occurrence[] {
  const byDate = new Map<string, Occurrence>();
  for (const item of [...items].sort((a, b) => a.date.localeCompare(b.date))) {
    const existing = byDate.get(item.date);
    if (existing) {
      existing.amount += absKopecks(item.amount);
      existing.ids.push(item.id);
      existing.last = item;
    } else {
      byDate.set(item.date, { date: item.date, amount: absKopecks(item.amount), ids: [item.id], last: item });
    }
  }
  return [...byDate.values()];
}

/**
 * Стабильность суммы. Если общий разброс велик, но до и после последнего скачка цена стабильна —
 * это смена цены (299 → 399), а не нерегулярный платёж: разброс считается по частям.
 */
function amountStability(amounts: bigint[], dates: string[]) {
  const whole = spread(amounts);
  if (whole <= STABLE) return { spread: whole, previous: null as bigint | null, changedAt: null as string | null };
  for (let k = amounts.length - 1; k >= 1; k--) {
    const prev = amounts[k - 1];
    if (prev === 0n || Math.abs(Number(amounts[k] - prev)) / Number(prev) <= PRICE_STEP) continue;
    const before = amounts.slice(0, k);
    const after = amounts.slice(k);
    if (before.length >= 2 && spread(before) <= STABLE && spread(after) <= STABLE) {
      return { spread: Math.max(spread(before), spread(after)), previous: medianBig(before), changedAt: dates[k] };
    }
    break;
  }
  return { spread: whole, previous: null, changedAt: null };
}

const displayNameOf = (candidate: Candidate, service: ServiceRef | null) =>
  (service?.name ?? (candidate.merchant?.trim() || candidate.description.trim())).slice(0, 120);

function detectTrial(groupKey: string, items: Candidate[], service: ServiceRef, today: string): DetectedSeries | null {
  const last = [...items].sort((a, b) => a.date.localeCompare(b.date)).at(-1)!;
  const trialDays = service.trialDays ?? 14;
  const charge = addDays(last.date, trialDays);
  if (charge < today) return null; // пробный период прошёл без списания — подписку не продлили
  const amount = absKopecks(last.amount);
  return {
    groupKey, displayName: service.name, direction: "out", kind: "trial", serviceId: service.id,
    accountId: last.accountId, categoryId: last.categoryId, currency: last.currency,
    periodicity: "monthly", intervalDays: trialDays,
    amountLast: amount, amountMedian: amount, amountMin: amount, amountMax: amount, amountPrevious: null, priceChangedAt: null,
    occurrences: items.length, firstDate: items[0].date, lastDate: last.date,
    nextExpectedDate: charge, expectedAmount: null, confidence: 0.7, ended: false,
    transactionIds: items.map((item) => item.id),
  };
}

function detectGroup(groupKey: string, items: Candidate[], services: ServiceRef[], today: string): DetectedSeries | null {
  const direction = items[0].type === "income" ? "in" : "out";
  const sample = items[items.length - 1];
  const service = direction === "out" ? matchService(sample.merchant || sample.description, services) : null;

  // пробные списания (до 10 ₽) у сервиса из справочника в расчёт периодичности не идут
  let regular = items;
  if (service) {
    const trials = items.filter((item) => absKopecks(item.amount) <= TRIAL_MAX);
    regular = items.filter((item) => absKopecks(item.amount) > TRIAL_MAX);
    if (!regular.length) return trials.length ? detectTrial(groupKey, trials, service, today) : null;
  }

  const occ = occurrencesOf(regular);
  if (occ.length < 2) return null;
  const intervals = occ.slice(1).map((o, i) => daysBetween(occ[i].date, o.date));
  const m = median(intervals);
  const periodicity = periodicityOf(m);
  if (!periodicity) return null;
  // годовую подписку видно по двум списаниям, если сервис из справочника; остальное — от трёх
  if (occ.length < 3 && !(periodicity === "yearly" && service)) return null;
  const mad = median(intervals.map((d) => Math.abs(d - m)));
  if (mad > (periodicity === "quarterly" || periodicity === "yearly" ? 7 : 3)) return null;

  const amounts = occ.map((o) => o.amount);
  const stability = amountStability(amounts, occ.map((o) => o.date));
  if (stability.spread > VARIABLE) return null;

  const last = occ[occ.length - 1];
  const text = normalizeText(`${last.last.merchant ?? ""} ${last.last.description}`);
  const kind = kindOf(direction, last.last.categoryCode, text, service, stability.spread <= STABLE);
  const confidence = Math.max(0, Math.min(1,
    0.4 * (1 - mad / m) + 0.3 * (1 - stability.spread) + 0.2 * Math.min(1, occ.length / 6) + (service ? 0.1 : 0),
  ));
  if (confidence < CONFIDENCE_THRESHOLD) return null;

  const ended = daysBetween(last.date, today) > m * 1.5;
  return {
    groupKey,
    displayName: displayNameOf(last.last, service),
    direction,
    kind,
    serviceId: service?.id ?? null,
    accountId: last.last.accountId,
    categoryId: last.last.categoryId,
    currency: last.last.currency,
    periodicity,
    intervalDays: Math.round(m),
    amountLast: last.amount,
    amountMedian: medianBig(amounts),
    amountMin: amounts.reduce((a, b) => (b < a ? b : a)),
    amountMax: amounts.reduce((a, b) => (b > a ? b : a)),
    amountPrevious: stability.previous,
    priceChangedAt: stability.changedAt,
    occurrences: occ.length,
    firstDate: occ[0].date,
    lastDate: last.date,
    nextExpectedDate: ended ? null : nextDate(last.date, periodicity),
    expectedAmount: ended ? null : last.amount,
    confidence: Math.round(confidence * 1000) / 1000,
    ended,
    transactionIds: occ.flatMap((o) => o.ids),
  };
}

/** Все серии пользователя по его операциям за последние 400 дней. */
export function detectSeries(candidates: Candidate[], services: ServiceRef[], today: string): DetectedSeries[] {
  const groups = new Map<string, Candidate[]>();
  for (const candidate of candidates) {
    const key = groupKeyOf(candidate);
    if (!key) continue;
    const id = `${candidate.type}|${candidate.currency}|${key}`;
    const list = groups.get(id);
    if (list) list.push(candidate);
    else groups.set(id, [candidate]);
  }
  const result: DetectedSeries[] = [];
  for (const [id, items] of groups) {
    items.sort((a, b) => a.date.localeCompare(b.date));
    const series = detectGroup(id.slice(id.indexOf("|", id.indexOf("|") + 1) + 1), items, services, today);
    if (series) result.push(series);
  }
  return result;
}
