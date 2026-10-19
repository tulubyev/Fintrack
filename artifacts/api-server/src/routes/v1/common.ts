import type { NextFunction, Response } from "express";
import { z } from "zod";
import type { AuthenticatedRequest } from "../../middleware/auth";
import { ApiError, sendError } from "../../lib/apiError";
import { isMoney, normalizeMoney, toKopecks } from "../../lib/money";
import { logger } from "../../services/logger";

/** Общее для маршрутов API v1: деньги, даты, обработка ошибок, id в пути. */

export const money = z.string().refine(isMoney, "Сумма в формате 1234.56").transform(normalizeMoney);
export const positiveMoney = money.refine((value) => toKopecks(value) > 0n, "Сумма должна быть больше нуля");

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Дата в формате ГГГГ-ММ-ДД")
  .refine((value) => !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().startsWith(value), "Такой даты нет");

export const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Время в формате ЧЧ:ММ");

/** Ошибки бизнес-правил (ApiError) — в формат v1, остальное — 500 без подробностей. */
export function handle(handler: (req: AuthenticatedRequest, res: Response) => Promise<unknown>) {
  return (req: AuthenticatedRequest, res: Response, _next: NextFunction) => {
    handler(req, res).catch((error) => {
      if (error instanceof ApiError) return sendError(res, error.status, error.code, error.message);
      logger.error(`${req.method} ${req.originalUrl}:`, error);
      sendError(res, 500, "INTERNAL_ERROR", "Не удалось выполнить запрос");
    });
  };
}

const UUID = z.string().uuid();
/** id из пути; некорректный — тот же 404, что и чужой ресурс. */
export function pathId(req: AuthenticatedRequest, notFoundMessage: string, param = "id"): string {
  const value = req.params[param];
  if (!UUID.safeParse(value).success) throw new ApiError(404, "NOT_FOUND", notFoundMessage);
  return value;
}

/** Параметр запроса списком: ?a=1&a=2 и ?a=1,2 дают ["1", "2"]. */
export const queryList = (value: unknown): string[] | undefined => {
  if (value === undefined) return undefined;
  const items = (Array.isArray(value) ? value : [value]).flatMap((item) => String(item).split(",")).map((item) => item.trim()).filter(Boolean);
  return items.length ? items : undefined;
};
