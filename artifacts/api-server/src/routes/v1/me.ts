import bcrypt from "bcrypt";
import { Router } from "express";
import { z } from "zod";
import { authenticateToken } from "../../middleware/auth";
import { ApiError, sendValidationError } from "../../lib/apiError";
import { deleteUserAccount } from "../../services/accountDeletion";
import { REFRESH_COOKIE, refreshCookieOptions } from "../../services/sessionService";
import { handle } from "./common";

/**
 * Аккаунт текущего пользователя: DELETE /api/v1/me — удалить аккаунт со всеми данными (E1.0-T6, 152-ФЗ).
 * Нужен пароль: удаление необратимо, а украденный access-токен не должен его позволять.
 */
export const meRouter = Router();

meRouter.use(authenticateToken);

const deleteSchema = z.object({ password: z.string().min(1).max(200) }).strict();

meRouter.delete("/", handle(async (req, res) => {
  const parsed = deleteSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  if (!(await bcrypt.compare(parsed.data.password, req.user.passwordHash))) {
    throw new ApiError(403, "WRONG_PASSWORD", "Неверный пароль");
  }
  await deleteUserAccount(req.user.id);
  res.clearCookie(REFRESH_COOKIE, refreshCookieOptions);
  res.status(204).end();
}));
