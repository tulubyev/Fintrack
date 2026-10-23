/**
 * Нейросеть для операций, которые конвейер не узнал (E1.3-T8, шаг 7). В модель уходит только очищенная строка
 * мерчанта, MCC, направление и корзина суммы — пачками до 50, без пользователя и дат. Переводы людям и строки
 * с именами людей не отправляются никогда. Ответы кешируются глобально на 90 дней. Включается флагом
 * LLM_CATEGORIZATION_ENABLED (по умолчанию выключено, решение D2) и настройкой пользователя.
 */
import { createHash } from "node:crypto";
import { and, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { db, categories, llmCategoryCache, llmUsageDaily, transactions, users } from "@workspace/db";
import { track } from "../analytics";
import { logger } from "../logger";
import { notify } from "../notificationService";
import { llmProvider, type LlmProvider } from "../llm/provider";
import { keywordCategory } from "./keywords";
import { merchantKey } from "./merchant";
import { loadCategoryResolver } from "./pipeline";

export const LLM_BATCH = 50;
export const LLM_DAILY_ROWS = 2000;
export const LLM_MIN_CONFIDENCE = 0.6;
const CACHE_DAYS = 90;

const model = () => process.env.LLM_CATEGORIZATION_MODEL?.trim() ?? "";
/** Флаг, провайдер (адрес и ключ) и модель заданы — шаг включён. */
export const llmCategorizationEnabled = () => process.env.LLM_CATEGORIZATION_ENABLED === "true" && Boolean(model()) && llmProvider() !== null;

// частые имена и фамилии: строка с ними — скорее всего перевод человеку, в модель не уходит
const PERSON_WORDS = new Set([
  "александр", "алексей", "андрей", "анна", "антон", "артем", "борис", "вадим", "валентина", "валерий", "василий", "вера",
  "виктор", "виктория", "владимир", "галина", "геннадий", "григорий", "дарья", "денис", "дмитрий", "евгений", "евгения",
  "екатерина", "елена", "иван", "игорь", "илья", "ирина", "кирилл", "константин", "ксения", "лариса", "людмила", "максим",
  "марина", "мария", "михаил", "надежда", "наталья", "наталия", "никита", "николай", "нина", "олег", "ольга", "павел",
  "петр", "роман", "светлана", "сергей", "софья", "станислав", "татьяна", "юлия", "юрий", "яна", "ярослав",
  "иванов", "петров", "сидоров", "смирнов", "кузнецов", "попов", "васильев", "соколов", "михайлов", "новиков", "федоров",
  "морозов", "волков", "алексеев", "лебедев", "семенов", "егоров", "павлов", "козлов", "степанов", "николаев", "орлов",
  "андреев", "макаров", "никитин", "захаров", "зайцев", "соловьев", "борисов", "яковлев", "григорьев", "романов",
  "воробьев", "сергеев", "кузьмин", "фролов", "александров", "дмитриев", "королев", "гусев", "киселев", "ильин",
  "sergey", "dmitriy", "yuriy", "aleksey", "andrey", "nikolay", "evgeniy",
]);
// терминалы пишут латиницей: те же имена и фамилии в транслите (иванов → ivanov)
const TRANSLIT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p",
  р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};
for (const name of [...PERSON_WORDS]) PERSON_WORDS.add([...name].map((letter) => TRANSLIT[letter] ?? letter).join(""));
// основа имени без конечной гласной: «сергею», «петрова», «smirnova» — то же имя в другом падеже; лишнее совпадение
// безопасно (строка просто не уйдёт в модель), пропущенное — нет
const PERSON_STEMS = [...PERSON_WORDS].map((name) => name.replace(/[аяйьоеиыуюyaeiou]$/, "")).filter((stem) => stem.length >= 3);
const isPersonWord = (token: string) =>
  PERSON_STEMS.some((stem) => token.startsWith(stem) && token.length - stem.length <= 3) || /(вич|вна|ична|vich|vna)$/.test(token);

/**
 * Строка для модели или null, если её отправлять нельзя: перевод человеку, имя человека, после очистки ничего не
 * осталось. Убираются e-mail, телефоны, маски карт, номера договоров и все числа от четырёх цифр.
 */
export function sanitizeForLlm(value: string | null | undefined): string | null {
  if (!value) return null;
  if (/[А-ЯЁ][а-яё]+\s+[А-ЯЁ]\.(\s*[А-ЯЁ]\.)?/.test(value) || /\b[A-Z][a-z]+\s+[A-Z]\.(\s*[A-Z]\.)?/.test(value)) return null;
  if (keywordCategory("out", value) === "p2p" || keywordCategory("in", value) === "inc.p2p") return null;
  const cleaned = value
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, " ")
    .replace(/(\+7|\b8)[\s(-]*\d{3}[\s)-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}/g, " ")
    .replace(/\d{2,6}[\s*xх.]*\*{2,}[\s*]*\d{2,4}|\*{2,}\s*\d{2,4}/gi, " ")
    .replace(/(?<![\p{L}\d])(№|no?|договор\p{L}*\s*№?)\s*[\p{L}\d/-]*\d[\p{L}\d/-]*/giu, " ")
    .replace(/\d{4,}/g, " ");
  const key = merchantKey(cleaned);
  if (key.split(" ").some(isPersonWord)) return null;
  return key.replace(/[^a-zа-я]/g, "").length >= 3 ? key.slice(0, 60) : null;
}

// корзины без длинных чисел: в модель не уходит ничего похожего на номер
export const amountBucket = (amount: number) => (amount < 500 ? "до 500 ₽" : amount < 2000 ? "500 ₽ – 2 тыс ₽" : amount < 10_000 ? "2–10 тыс ₽" : "больше 10 тыс ₽");
export const llmCacheKey = (text: string, mcc: string | null, direction: "in" | "out") =>
  createHash("sha256").update(`${text}|${mcc ?? ""}|${direction}`).digest("hex");

interface Item { i: number; text: string; mcc: string | null; direction: "in" | "out"; amount: string }
interface Answer { categoryCode: string | null; confidence: number }

const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["i", "category_code", "confidence"],
        properties: { i: { type: "integer" }, category_code: { type: ["string", "null"] }, confidence: { type: "number" } },
      },
    },
  },
};

/** Разбор ответа модели: только известные коды нужного вида; null — ответ невалиден целиком. */
export function parseAnswer(content: string, batch: Item[], allowed: Map<string, string>): Map<number, Answer> | null {
  let parsed: unknown;
  try { parsed = JSON.parse(content); } catch { return null; }
  const list = (parsed as { items?: unknown })?.items;
  if (!Array.isArray(list)) return null;
  const byIndex = new Map(batch.map((item) => [item.i, item]));
  const answers = new Map<number, Answer>();
  for (const raw of list) {
    const row = raw as { i?: unknown; category_code?: unknown; confidence?: unknown };
    const item = typeof row.i === "number" ? byIndex.get(row.i) : undefined;
    if (!item || typeof row.confidence !== "number") continue;
    const code = typeof row.category_code === "string" ? row.category_code : null;
    const fits = code !== null && allowed.get(code) === (item.direction === "out" ? "expense" : "income");
    answers.set(item.i, { categoryCode: fits ? code : null, confidence: fits ? Math.min(Math.max(row.confidence, 0), 1) : 0 });
  }
  return answers;
}

async function askModel(provider: LlmProvider, batch: Item[], catalog: string, allowed: Map<string, string>) {
  const messages = [
    {
      role: "system" as const,
      content: "Ты относишь названия продавцов из банковских выписок России к категориям расходов и доходов. "
        + "Отвечай только JSON по схеме. category_code — строго код из списка; если не знаешь продавца, category_code = null. "
        + "confidence — от 0 до 1. direction: out — списание (категории расходов), in — поступление (категории доходов).\n"
        + `Категории:\n${catalog}`,
    },
    { role: "user" as const, content: JSON.stringify(batch) },
  ];
  let tokens = 0;
  // невалидный ответ — один повтор, затем категория не ставится
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await provider.chat({ model: model(), messages, jsonSchema: { name: "categories", schema: RESPONSE_SCHEMA } });
    tokens += result.totalTokens ?? 0;
    const answers = parseAnswer(result.content, batch, allowed);
    if (answers) return { answers, tokens, model: result.model };
  }
  return { answers: new Map<number, Answer>(), tokens, model: model() };
}

const today = () => new Date().toISOString().slice(0, 10);

/** Стоимость токенов в копейках по цене из .env (LLM_PRICE_RUB_PER_1K_TOKENS); без цены — 0. */
const costKopecks = (tokens: number) => Math.round((tokens / 1000) * Number(process.env.LLM_PRICE_RUB_PER_1K_TOKENS ?? 0) * 100);

async function monthlySpentKopecks(): Promise<number> {
  const [row] = await db.select({ total: sql<string>`coalesce(sum(${llmUsageDaily.costKopecks}), 0)` }).from(llmUsageDaily)
    .where(gte(llmUsageDaily.day, `${today().slice(0, 7)}-01`));
  return Number(row?.total ?? 0);
}

async function budgetExceeded(): Promise<boolean> {
  const budget = Number(process.env.LLM_MONTHLY_BUDGET_RUB ?? 0);
  if (!budget || (await monthlySpentKopecks()) < budget * 100) return false;
  // бюджет исчерпан: очередь стоит до следующего месяца, администраторы узнают один раз за месяц
  const admins = await db.select({ id: users.id }).from(users).where(inArray(users.adminRole, ["super_admin", "finance_admin"]));
  for (const admin of admins) {
    await notify(admin.id, {
      type: "system",
      title: "Бюджет нейросети на месяц исчерпан",
      body: "Категоризация нейросетью приостановлена до следующего месяца или увеличения LLM_MONTHLY_BUDGET_RUB.",
      dedupKey: `llm-budget:${today().slice(0, 7)}`,
    });
  }
  logger.warn("categorize.llm: месячный бюджет исчерпан");
  return true;
}

async function recordUsage(userId: string, rows: number, tokens: number) {
  if (!rows && !tokens) return;
  await db.insert(llmUsageDaily).values({ userId, day: today(), rows, costKopecks: costKopecks(tokens) }).onConflictDoUpdate({
    target: [llmUsageDaily.userId, llmUsageDaily.day],
    set: { rows: sql`${llmUsageDaily.rows} + ${rows}`, costKopecks: sql`${llmUsageDaily.costKopecks} + ${costKopecks(tokens)}` },
  });
}

export interface LlmRunResult { skipped?: "disabled" | "user_off" | "daily_limit" | "budget"; items: number; cacheHits: number; assigned: number; suggested: number }

/**
 * Категоризация нейросетью операций пользователя без категории (или только указанных). Повторный запуск безопасен:
 * берутся только операции, которые всё ещё без категории, ответы — из кеша.
 */
export async function runLlmCategorization(userId: string, transactionIds?: string[]): Promise<LlmRunResult> {
  const empty = { items: 0, cacheHits: 0, assigned: 0, suggested: 0 };
  const provider = llmProvider();
  if (!llmCategorizationEnabled() || !provider) return { ...empty, skipped: "disabled" };
  const [user] = await db.select({ llm: users.llmCategorization }).from(users).where(eq(users.id, userId));
  if (!user?.llm) return { ...empty, skipped: "user_off" };
  const [usage] = await db.select().from(llmUsageDaily).where(and(eq(llmUsageDaily.userId, userId), eq(llmUsageDaily.day, today())));
  const quota = LLM_DAILY_ROWS - (usage?.rows ?? 0);
  if (quota <= 0) return { ...empty, skipped: "daily_limit" };

  const rows = await db.select().from(transactions).where(and(
    eq(transactions.userId, userId), isNull(transactions.deletedAt), eq(transactions.categorySource, "none"),
    inArray(transactions.type, ["expense", "income"]), isNull(transactions.suggestedCategoryId),
    ...(transactionIds?.length ? [inArray(transactions.id, transactionIds)] : []),
  )).limit(quota);
  const items = rows.flatMap((row) => {
    const text = sanitizeForLlm(row.merchantNormalized || row.merchant || row.description);
    if (!text) return [];
    const direction = row.type === "income" ? "in" as const : "out" as const;
    return [{ row, text, direction, key: llmCacheKey(text, row.mcc, direction), amount: amountBucket(Math.abs(Number(row.amountRub ?? row.amount))) }];
  });
  if (!items.length) return empty;

  const started = Date.now();
  const cached = await db.select().from(llmCategoryCache).where(and(
    inArray(llmCategoryCache.key, [...new Set(items.map((item) => item.key))]),
    gte(llmCategoryCache.createdAt, new Date(Date.now() - CACHE_DAYS * 86_400_000)),
  ));
  const answers = new Map(cached.map((row) => [row.key, { categoryCode: row.categoryCode, confidence: row.confidence }]));
  const cacheHits = items.filter((item) => answers.has(item.key)).length;

  const misses = [...new Map(items.filter((item) => !answers.has(item.key)).map((item) => [item.key, item])).values()];
  let tokens = 0;
  let sent = 0;
  if (misses.length) {
    const catalogRows = await db.select({ code: categories.code, name: categories.name, kind: categories.kind }).from(categories)
      .where(and(isNull(categories.userId), isNull(categories.deletedAt), inArray(categories.kind, ["expense", "income"])));
    const allowed = new Map(catalogRows.map((row) => [row.code!, row.kind]));
    const catalog = catalogRows.map((row) => `${row.code} — ${row.name} (${row.kind === "expense" ? "расход" : "доход"})`).join("\n");
    for (let start = 0; start < misses.length; start += LLM_BATCH) {
      if (await budgetExceeded()) {
        await recordUsage(userId, sent, tokens);
        return { ...empty, cacheHits, skipped: "budget" };
      }
      const chunk = misses.slice(start, start + LLM_BATCH);
      const batch: Item[] = chunk.map((item, i) => ({ i, text: item.text, mcc: item.row.mcc, direction: item.direction, amount: item.amount }));
      const reply = await askModel(provider, batch, catalog, allowed);
      tokens += reply.tokens;
      sent += chunk.length;
      for (const [i, item] of chunk.entries()) {
        const answer = reply.answers.get(i) ?? { categoryCode: null, confidence: 0 };
        answers.set(item.key, answer);
        await db.insert(llmCategoryCache).values({ key: item.key, categoryCode: answer.categoryCode, confidence: answer.confidence, model: reply.model.slice(0, 60) })
          .onConflictDoUpdate({ target: llmCategoryCache.key, set: { categoryCode: answer.categoryCode, confidence: answer.confidence, model: reply.model.slice(0, 60), createdAt: new Date() } });
      }
    }
  }

  const { resolve } = await loadCategoryResolver(userId);
  let assigned = 0;
  let suggested = 0;
  for (const item of items) {
    const answer = answers.get(item.key);
    const categoryId = resolve(answer?.categoryCode, item.direction === "out" ? "expense" : "income");
    if (!answer || !categoryId) continue;
    const confident = answer.confidence >= LLM_MIN_CONFIDENCE;
    // операцию могли разметить, пока ждали ответа: трогаем только всё ещё «без категории»
    const updated = await db.update(transactions).set(confident
      ? { categoryId, categorySource: "llm", categoryConfidence: answer.confidence, updatedAt: new Date() }
      : { suggestedCategoryId: categoryId, updatedAt: new Date() })
      .where(and(eq(transactions.id, item.row.id), eq(transactions.categorySource, "none"))).returning({ id: transactions.id });
    if (updated.length) confident ? assigned++ : suggested++;
  }
  await recordUsage(userId, items.length, tokens);
  void track("llm_categorization_batch", {
    userId,
    props: { items: items.length, cache_hits: cacheHits, assigned, latency_ms: Date.now() - started, provider: provider.name, cost_kopecks: costKopecks(tokens) },
  });
  return { items: items.length, cacheHits, assigned, suggested };
}

/** Ставит категоризацию нейросетью после записи операций: в очередь, а без очереди — в фоне процесса. */
export async function scheduleLlmCategorization(userId: string, transactionIds: string[]): Promise<void> {
  if (!llmCategorizationEnabled() || !transactionIds.length) return;
  const { enqueue, jobsBoss } = await import("../../jobs");
  if (jobsBoss()) {
    await enqueue("categorize.llm", { userId, transactionIds });
    return;
  }
  void runLlmCategorization(userId, transactionIds).catch((error) => logger.warn("categorize.llm:", error));
}
