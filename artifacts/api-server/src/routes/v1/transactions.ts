import { Router } from "express";
import { z } from "zod";
import { TRANSACTION_TYPES } from "@shared/schema";
import { authenticateToken } from "../../middleware/auth";
import { sendValidationError } from "../../lib/apiError";
import { track } from "../../services/analytics";
import {
  bulkUpdate, createTransaction, createTransfer, deleteTransaction, getTransaction, linkTransfer, listTransactions,
  summarizeTransactions, transferSuggestions, unlinkTransfer, updateTransaction, type TransactionFilters,
} from "../../services/transactionService";
import { handle, hhmm, isoDate, pathId, positiveMoney, queryList } from "./common";

/** Операции (E1.1-T4) и переводы между своими счетами (E1.1-T5). */
export const transactionsRouter = Router();
export const transfersRouter = Router();

const SOURCES = ["manual", "import", "notification", "bank_api", "receipt"] as const;

const filtersSchema = z.object({
  accountId: z.array(z.string().uuid()).optional(),
  categoryId: z.array(z.string().uuid()).optional(),
  type: z.array(z.enum(TRANSACTION_TYPES)).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  amountMin: positiveMoney.optional(),
  amountMax: positiveMoney.optional(),
  q: z.string().trim().min(1).max(100).optional(),
  source: z.array(z.enum(SOURCES)).optional(),
  uncategorized: z.enum(["true", "false"]).optional(),
  recurringSeriesId: z.string().uuid().optional(),
});

function parseFilters(query: Record<string, unknown>) {
  return filtersSchema.safeParse({
    ...query,
    accountId: queryList(query.accountId),
    categoryId: queryList(query.categoryId),
    type: queryList(query.type),
    source: queryList(query.source),
  });
}

const toFilters = (data: z.infer<typeof filtersSchema>): TransactionFilters => ({
  accountIds: data.accountId,
  categoryIds: data.categoryId,
  types: data.type,
  from: data.from,
  to: data.to,
  amountMin: data.amountMin,
  amountMax: data.amountMax,
  q: data.q,
  sources: data.source,
  uncategorized: data.uncategorized === "true",
  recurringSeriesId: data.recurringSeriesId,
});

const createSchema = z.object({
  id: z.string().uuid().optional(),
  accountId: z.string().uuid(),
  type: z.enum(["expense", "income"]),
  amount: positiveMoney,
  currency: z.string().regex(/^[A-Z]{3}$/).optional(),
  date: isoDate,
  time: hhmm.nullable().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  merchant: z.string().trim().max(200).nullable().optional(),
  description: z.string().trim().max(500).nullable().optional(),
  note: z.string().trim().max(1000).nullable().optional(),
  excludeFromStats: z.boolean().optional(),
}).strict();

const patchSchema = z.object({
  categoryId: z.string().uuid().nullable(),
  merchant: z.string().trim().max(200).nullable(),
  note: z.string().trim().max(1000).nullable(),
  excludeFromStats: z.boolean(),
  applyToSimilar: z.literal("none"), // «эта и будущие» — с правилами категорий (E1.3)
  amount: positiveMoney,
  date: isoDate,
  time: hhmm.nullable(),
  type: z.enum(["expense", "income"]),
  accountId: z.string().uuid(),
}).partial().strict().refine((patch) => Object.keys(patch).some((key) => key !== "applyToSimilar"), "Нечего менять");

const bulkSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
  action: z.enum(["set_category", "delete", "exclude", "include"]),
  categoryId: z.string().uuid().optional(),
}).strict().refine((body) => body.action !== "set_category" || body.categoryId, { message: "Для set_category нужна categoryId", path: ["categoryId"] });

const transferSchema = z.object({
  id: z.string().uuid().optional(),
  fromAccountId: z.string().uuid(),
  toAccountId: z.string().uuid(),
  amount: positiveMoney,
  toAmount: positiveMoney.optional(),
  date: isoDate,
  note: z.string().trim().max(1000).nullable().optional(),
}).strict();

const linkSchema = z.object({ outgoingId: z.string().uuid(), incomingId: z.string().uuid() }).strict();

const countBucket = (count: number) => (count <= 1 ? "1" : count <= 10 ? "2-10" : count <= 100 ? "11-100" : "100+");

transactionsRouter.use(authenticateToken);
transfersRouter.use(authenticateToken);

transactionsRouter.get("/", handle(async (req, res) => {
  const parsed = parseFilters(req.query);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const limit = Math.min(Math.max(Number.parseInt(String(req.query.limit ?? "50"), 10) || 50, 1), 200);
  res.json(await listTransactions(req.user.id, toFilters(parsed.data), limit, typeof req.query.cursor === "string" ? req.query.cursor : undefined));
}));

transactionsRouter.get("/summary", handle(async (req, res) => {
  const parsed = parseFilters(req.query);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  res.json(await summarizeTransactions(req.user.id, toFilters(parsed.data)));
}));

transactionsRouter.post("/bulk", handle(async (req, res) => {
  const parsed = bulkSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const updated = await bulkUpdate(req.user.id, parsed.data.ids, parsed.data.action, parsed.data.categoryId);
  void track("transactions_bulk_updated", { userId: req.user.id, props: { action: parsed.data.action, count_bucket: countBucket(updated) } });
  res.json({ updated });
}));

transactionsRouter.get("/:id", handle(async (req, res) => {
  res.json(await getTransaction(req.user.id, pathId(req, "Операция не найдена")));
}));

transactionsRouter.post("/", handle(async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const { transaction, created } = await createTransaction(req.user.id, parsed.data);
  if (created) {
    void track("transaction_created", { userId: req.user.id, props: {
      source: transaction.source, type: transaction.type, has_category: Boolean(transaction.categoryId), category_source: transaction.categorySource, via: "api",
    } });
  }
  res.status(created ? 201 : 200).json(transaction);
}));

transactionsRouter.patch("/:id", handle(async (req, res) => {
  const id = pathId(req, "Операция не найдена");
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const { applyToSimilar: _applyToSimilar, ...patch } = parsed.data;
  const transaction = await updateTransaction(req.user.id, id, patch);
  void track("transaction_updated", { userId: req.user.id, props: { fields: Object.keys(patch).sort().join(","), source: transaction.source } });
  res.json({ transaction });
}));

transactionsRouter.delete("/:id", handle(async (req, res) => {
  const row = await deleteTransaction(req.user.id, pathId(req, "Операция не найдена"));
  void track("transaction_deleted", { userId: req.user.id, props: { source: row.source, type: row.type } });
  res.status(204).end();
}));

transfersRouter.get("/suggestions", handle(async (req, res) => {
  const suggestions = await transferSuggestions(req.user.id);
  if (suggestions.length) void track("transfer_suggestion_shown", { userId: req.user.id, props: { count: suggestions.length } });
  res.json(suggestions);
}));

transfersRouter.post("/", handle(async (req, res) => {
  const parsed = transferSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const { created, sameCurrency, ...transfer } = await createTransfer(req.user.id, parsed.data);
  if (created) void track("transfer_created", { userId: req.user.id, props: { same_currency: sameCurrency } });
  res.status(created ? 201 : 200).json(transfer);
}));

transfersRouter.post("/link", handle(async (req, res) => {
  const parsed = linkSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const transferGroupId = await linkTransfer(req.user.id, parsed.data.outgoingId, parsed.data.incomingId);
  void track("transfer_linked", { userId: req.user.id, props: { from_suggestion: req.query.fromSuggestion === "true" } });
  res.json({ transferGroupId });
}));

transfersRouter.delete("/:groupId", handle(async (req, res) => {
  await unlinkTransfer(req.user.id, pathId(req, "Перевод не найден", "groupId"), req.query.keepTransactions === "true");
  res.status(204).end();
}));
