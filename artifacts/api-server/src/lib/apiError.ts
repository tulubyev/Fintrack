import type { Response } from "express";
import type { ZodError } from "zod";

/** Единый формат ошибок API v1: { error: { code, message, details? } } (docs/product/ROADMAP.md §1). */
export function sendError(res: Response, status: number, code: string, message: string, details?: unknown) {
  return res.status(status).json({ error: { code, message, ...(details === undefined ? {} : { details }) } });
}

export const sendValidationError = (res: Response, error: ZodError, message = "Некорректный запрос") =>
  sendError(res, 400, "VALIDATION_ERROR", message, error.flatten());

/** Ошибка бизнес-правила, которую маршрут превращает в ответ с кодом. */
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}
