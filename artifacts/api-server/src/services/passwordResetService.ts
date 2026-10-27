import crypto from "crypto";
import bcrypt from "bcrypt";
import { and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { authSessions, users, verificationCodes, type User } from "@shared/schema";
import { storage } from "../storage";
import { smsService } from "./smsService";
import { emailService } from "./emailService";
import { logger } from "./logger";
import { revokedSessionFields } from "./sessionService";

export type ResetChannel = "sms" | "email";

const CODE_TTL_MS = 15 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_CODES_PER_HOUR = 5;
const MAX_ATTEMPTS = 5;
const RESET_TYPES = ["password_reset_sms", "password_reset_email"];

// Единый ответ на любой запрос сброса — не раскрываем, существует ли аккаунт
export const RESET_REQUEST_MESSAGE =
  "Если аккаунт с такими данными существует, мы отправили код для восстановления пароля";

export class PasswordResetError extends Error {}

function maskTarget(target: string, channel: ResetChannel): string {
  if (channel === "email") {
    const [name, domain] = target.split("@");
    return `${name.slice(0, 2)}***@${domain}`;
  }
  return `${target.slice(0, 4)}***${target.slice(-2)}`;
}

export class PasswordResetService {
  /**
   * Отправляет код сброса по SMS или email. Канал по умолчанию — тот, через который
   * пользователь себя идентифицировал (email → письмо, телефон → SMS).
   * Возвращает маску адреса, куда ушёл код (для логов), или null, если отправлять некуда.
   */
  async requestReset(identifier: string, preferred?: ResetChannel): Promise<string | null> {
    const user = await storage.getUserByIdentifier(identifier.trim());
    const channel: ResetChannel = preferred ?? (identifier.includes("@") ? "email" : "sms");
    if (!user) {
      logger.info(`Password reset requested for unknown account ${maskTarget(identifier.trim(), identifier.includes("@") ? "email" : "sms")}`);
      return null;
    }

    const target = channel === "email" ? user.email : user.phone;
    if (!target) {
      logger.info(`Password reset requested via ${channel} for user ${user.id}, but the account has no ${channel === "email" ? "email" : "phone"}`);
      return null;
    }

    const type = `password_reset_${channel}`;
    const recent = await db
      .select({ createdAt: verificationCodes.createdAt })
      .from(verificationCodes)
      .where(and(
        eq(verificationCodes.userId, user.id),
        inArray(verificationCodes.type, RESET_TYPES),
        gte(verificationCodes.createdAt, new Date(Date.now() - 60 * 60 * 1000)),
      ))
      .orderBy(desc(verificationCodes.createdAt));

    const last = recent[0]?.createdAt;
    if ((last && Date.now() - last.getTime() < RESEND_COOLDOWN_MS) || recent.length >= MAX_CODES_PER_HOUR) {
      logger.warn(`Password reset throttled for user ${user.id}`);
      return maskTarget(target, channel);
    }

    const code = crypto.randomInt(100000, 1000000).toString();

    // Предыдущие коды сброса становятся недействительными
    await db.update(verificationCodes)
      .set({ isUsed: true })
      .where(and(
        eq(verificationCodes.userId, user.id),
        inArray(verificationCodes.type, RESET_TYPES),
        eq(verificationCodes.isUsed, false),
      ));

    await db.insert(verificationCodes).values({
      userId: user.id,
      type,
      code,
      target,
      attempts: 0,
      maxAttempts: MAX_ATTEMPTS,
      expiresAt: new Date(Date.now() + CODE_TTL_MS),
    });

    const sent = channel === "email"
      ? await this.sendEmail(target, user, code)
      : await smsService.sendSMS(target, `FinTrack: код для восстановления пароля ${code}. Никому его не сообщайте.`);

    if (!sent.success) {
      const reason = "message" in sent ? sent.message : "error" in sent ? sent.error : undefined;
      logger.error(`Password reset code was not delivered via ${channel} to user ${user.id}: ${reason ?? "unknown error"}`);
    } else {
      logger.info(`Password reset code sent via ${channel} to ${maskTarget(target, channel)} for user ${user.id}`);
    }

    return maskTarget(target, channel);
  }

  /** Проверяет код и устанавливает новый пароль. */
  async resetPassword(identifier: string, code: string, newPassword: string): Promise<void> {
    const invalid = new PasswordResetError("Неверный или просроченный код");

    const user = await storage.getUserByIdentifier(identifier.trim());
    if (!user) throw invalid;

    const [entry] = await db
      .select()
      .from(verificationCodes)
      .where(and(
        eq(verificationCodes.userId, user.id),
        inArray(verificationCodes.type, RESET_TYPES),
        eq(verificationCodes.isUsed, false),
        gte(verificationCodes.expiresAt, new Date()),
      ))
      .orderBy(desc(verificationCodes.createdAt))
      .limit(1);

    if (!entry) throw invalid;

    // Попытка занимается атомарно до сравнения: параллельные запросы не обойдут лимит
    const maxAttempts = entry.maxAttempts ?? MAX_ATTEMPTS;
    const [claimed] = await db.update(verificationCodes)
      .set({ attempts: sql`coalesce(${verificationCodes.attempts}, 0) + 1` })
      .where(and(
        eq(verificationCodes.id, entry.id),
        eq(verificationCodes.isUsed, false),
        sql`coalesce(${verificationCodes.attempts}, 0) < ${maxAttempts}`,
      ))
      .returning({ id: verificationCodes.id });

    if (!claimed) {
      await db.update(verificationCodes).set({ isUsed: true }).where(eq(verificationCodes.id, entry.id));
      throw new PasswordResetError("Слишком много попыток. Запросите новый код");
    }

    const expected = Buffer.from(entry.code);
    const given = Buffer.from(code.trim());
    const matches = expected.length === given.length && crypto.timingSafeEqual(expected, given);
    if (!matches) throw invalid;

    const passwordHash = await bcrypt.hash(newPassword, 12);

    // Код гасится условно и вместе со сменой пароля: из двух одновременных верных
    // запросов пароль сменит только один
    const changed = await db.transaction(async (tx) => {
      const [consumed] = await tx.update(verificationCodes)
        .set({ isUsed: true })
        .where(and(eq(verificationCodes.id, entry.id), eq(verificationCodes.isUsed, false)))
        .returning({ id: verificationCodes.id });
      if (!consumed) return false;

      await tx.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, user.id));
      // Новый пароль завершает все сессии: если пароль сбрасывают из-за взлома, злоумышленник выходит
      await tx.update(authSessions)
        .set(revokedSessionFields(new Date()))
        .where(and(eq(authSessions.userId, user.id), isNull(authSessions.revokedAt)));
      await tx.update(verificationCodes)
        .set({ isUsed: true })
        .where(and(eq(verificationCodes.userId, user.id), inArray(verificationCodes.type, RESET_TYPES)));
      return true;
    });
    if (!changed) throw invalid;

    logger.info(`Password reset completed for user ${user.id}`);
  }

  private sendEmail(to: string, user: User, code: string) {
    return emailService.sendEmail({
      to,
      subject: "FinTrack: восстановление пароля",
      text:
        `Здравствуйте, ${user.firstName}!\n\n` +
        `Код для восстановления пароля: ${code}\n` +
        `Код действует 15 минут. Если вы не запрашивали сброс пароля, просто проигнорируйте это письмо.\n\n` +
        `FinTrack — https://fin-wall.ru`,
    });
  }
}

export const passwordResetService = new PasswordResetService();
