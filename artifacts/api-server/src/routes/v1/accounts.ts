import { Router, type Response, type NextFunction } from "express";
import { z } from "zod";
import { ACCOUNT_KINDS } from "@shared/schema";
import { authenticateToken, type AuthenticatedRequest } from "../../middleware/auth";
import { ApiError, sendError, sendValidationError } from "../../lib/apiError";
import { isMoney, normalizeMoney, toKopecks } from "../../lib/money";
import { INSTITUTION_CODES, INSTITUTIONS } from "../../lib/institutions";
import { track } from "../../services/analytics";
import { logger } from "../../services/logger";
import {
  adjustBalance, createAccount, deleteAccount, getAccount, listAccounts, setArchived, updateAccount,
} from "../../services/ledgerService";

/** Счета пользователя (E1.1-T3): /api/v1/accounts и справочник банков /api/v1/institutions. */
export const accountsRouter = Router();
export const institutionsRouter = Router();

const money = z.string().refine(isMoney, "Сумма в формате 1234.56").transform(normalizeMoney);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Дата в формате ГГГГ-ММ-ДД")
  .refine((value) => !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().startsWith(value), "Такой даты нет");

const accountFields = {
  name: z.string().trim().min(1).max(60),
  kind: z.enum(ACCOUNT_KINDS),
  institutionCode: z.enum(INSTITUTION_CODES).nullable(),
  currency: z.string().regex(/^[A-Z]{3}$/, "Код валюты ISO 4217, например RUB"),
  openingBalance: money,
  openingBalanceDate: isoDate.nullable(),
  lastFour: z.string().regex(/^\d{4}$/, "Последние 4 цифры").nullable(),
  creditLimit: money.refine((value) => toKopecks(value) >= 0n, "Лимит не может быть отрицательным").nullable(),
  includeInTotal: z.boolean(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable(),
  icon: z.string().max(40).nullable(),
  sortOrder: z.number().int().min(0).max(10_000),
};

const createSchema = z.object({
  id: z.string().uuid().optional(), // повтор с тем же id не создаёт дубль
  name: accountFields.name,
  kind: accountFields.kind,
}).merge(z.object(accountFields).omit({ name: true, kind: true }).partial()).strict();

const patchSchema = z.object(accountFields).partial().strict()
  .refine((patch) => Object.keys(patch).length > 0, "Нечего менять");

const adjustmentSchema = z.object({ actualBalance: money, date: isoDate }).strict();

// Ошибки бизнес-правил — в формат v1, остальное — 500 без подробностей
function handle(handler: (req: AuthenticatedRequest, res: Response) => Promise<unknown>) {
  return (req: AuthenticatedRequest, res: Response, _next: NextFunction) => {
    handler(req, res).catch((error) => {
      if (error instanceof ApiError) return sendError(res, error.status, error.code, error.message);
      logger.error(`${req.method} ${req.originalUrl}:`, error);
      sendError(res, 500, "INTERNAL_ERROR", "Не удалось выполнить запрос");
    });
  };
}

const UUID = z.string().uuid();
// Некорректный id — тот же 404, что и чужой счёт
const accountId = (req: AuthenticatedRequest) => {
  if (!UUID.safeParse(req.params.id).success) throw new ApiError(404, "NOT_FOUND", "Счёт не найден");
  return req.params.id;
};

accountsRouter.use(authenticateToken);

accountsRouter.get("/", handle(async (req, res) => {
  res.json(await listAccounts(req.user.id, req.query.includeArchived === "true"));
}));

accountsRouter.post("/", handle(async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const { account, created } = await createAccount(req.user.id, parsed.data);
  if (created) {
    void track("account_created", { userId: req.user.id, props: {
      kind: account.kind, institution: account.institutionCode, currency: account.currency,
      has_opening_balance: account.openingBalance !== "0.00", via: "api",
    } });
  }
  res.status(created ? 201 : 200).json(account);
}));

accountsRouter.get("/:id", handle(async (req, res) => {
  res.json(await getAccount(req.user.id, accountId(req)));
}));

accountsRouter.patch("/:id", handle(async (req, res) => {
  const id = accountId(req);
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  res.json(await updateAccount(req.user.id, id, parsed.data));
}));

accountsRouter.post("/:id/archive", handle(async (req, res) => {
  const account = await setArchived(req.user.id, accountId(req), true);
  void track("account_archived", { userId: req.user.id, props: { kind: account.kind } });
  res.json(account);
}));

accountsRouter.post("/:id/unarchive", handle(async (req, res) => {
  res.json(await setArchived(req.user.id, accountId(req), false));
}));

accountsRouter.delete("/:id", handle(async (req, res) => {
  await deleteAccount(req.user.id, accountId(req), req.query.withTransactions === "true");
  res.status(204).end();
}));

accountsRouter.post("/:id/balance-adjustments", handle(async (req, res) => {
  const id = accountId(req);
  const parsed = adjustmentSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const { account, adjustment, diff } = await adjustBalance(req.user.id, id, parsed.data.actualBalance, parsed.data.date);
  const abs = diff < 0n ? -diff : diff;
  void track("balance_adjusted", { userId: req.user.id, props: {
    direction: diff > 0n ? "up" : diff < 0n ? "down" : "none",
    // корзина вместо точной суммы: в аналитике не нужна точность до копейки
    amount_bucket: abs === 0n ? "0" : abs < 100_000n ? "<1000" : abs < 1_000_000n ? "<10000" : abs < 10_000_000n ? "<100000" : "100000+",
  } });
  res.json({ account, adjustment });
}));

institutionsRouter.get("/", authenticateToken, (_req, res: Response) => {
  res.json(INSTITUTIONS.map((institution) => ({ ...institution, logoUrl: null, instructionsUrl: null })));
});
