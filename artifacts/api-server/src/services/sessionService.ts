import crypto from "crypto";
import jwt from "jsonwebtoken";
import type { Request, Response } from "express";
import { and, desc, eq, gt, isNull, lt, ne, or } from "drizzle-orm";
import { authSessions, type AuthSession, type User } from "@shared/schema";
import { db } from "../db";
import { config } from "../../config/environment";

/**
 * Сессии входа.
 *
 * Access-токен — JWT на 15 минут с id сессии (`sid`): отозванная сессия перестаёт
 * работать сразу, а не после истечения токена. Refresh-токен — случайная строка
 * на 30 дней; в БД хранится только его хеш. При каждом обновлении refresh-токен
 * меняется. Заменённый токен, предъявленный в течение минуты (параллельная вкладка,
 * потерянный в мобильной сети ответ), получает ту же новую пару; позже — это признак
 * кражи, и сессия отзывается целиком.
 */

export const ACCESS_TOKEN_TTL = "15m";
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
// Две вкладки могут обновить токен одновременно, а ответ на обновление — потеряться в сети:
// в этом окне старый токен получает ту же новую пару, сессия не отзывается
export const ROTATION_GRACE_MS = 60 * 1000;

/** Отзыв сессии стирает и push-токен устройства (E2.2): уведомления на отозванное устройство не уходят. */
export const revokedSessionFields = (now: Date) => ({ revokedAt: now, pushProvider: null, pushToken: null, pushTokenUpdatedAt: null });

export class SessionError extends Error {}
// Токен только что заменён, но выдать новую пару повторно нельзя (сессия обновлена до появления
// replay_token_enc или дважды подряд) — сессия жива, клиент сохраняет то, что у него есть
export class ConcurrentRefreshError extends SessionError {}

// Refresh-токен для веба живёт в HttpOnly-cookie, доступной только эндпоинтам /api/auth
export const REFRESH_COOKIE = "refreshToken";
export const refreshCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/api/auth",
};

/** Ставит cookie с refresh-токеном и возвращает токены для тела ответа (мобильному клиенту). */
export function sendSession(res: Response, tokens: IssuedTokens) {
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, { ...refreshCookieOptions, maxAge: REFRESH_TOKEN_TTL_MS });
  return { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
}

export interface SessionInfo {
  id: string;
  deviceName: string | null;
  ipAddress: string | null;
  createdAt: Date;
  lastUsedAt: Date;
  current: boolean;
}

const hashToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

/**
 * Новый refresh-токен, зашифрованный ключом из предыдущего (AES-256-GCM). В БД без предыдущего
 * токена его не прочитать — правило «в БД только хеш» сохраняется для всех, кто не держит старый токен.
 */
const replayKey = (previousToken: string) =>
  Buffer.from(crypto.hkdfSync("sha256", previousToken, Buffer.alloc(0), "fintrack:refresh-replay", 32));

function sealReplayToken(nextToken: string, previousToken: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", replayKey(previousToken), iv);
  const ciphertext = Buffer.concat([cipher.update(nextToken, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64url");
}

function openReplayToken(sealed: string, previousToken: string): string | null {
  try {
    const data = Buffer.from(sealed, "base64url");
    const decipher = crypto.createDecipheriv("aes-256-gcm", replayKey(previousToken), data.subarray(0, 12));
    decipher.setAuthTag(data.subarray(12, 28));
    return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

function clientInfo(req: Request) {
  const userAgent = (req.headers["user-agent"] || "").toString();
  return {
    deviceName: userAgent ? userAgent.slice(0, 200) : null,
    ipAddress: (req.ip || "").slice(0, 64) || null,
  };
}

export class SessionService {
  signAccessToken(user: Pick<User, "id">, sessionId: string): string {
    return jwt.sign({ userId: user.id, sid: sessionId, type: "access" }, config.crypto.jwtSecret, {
      expiresIn: ACCESS_TOKEN_TTL,
      issuer: "fintrack-api",
    });
  }

  /** Новая сессия после входа, регистрации или входа через ЕСИА. */
  async createSession(user: Pick<User, "id">, req: Request): Promise<IssuedTokens> {
    const refreshToken = crypto.randomBytes(32).toString("base64url");
    const [session] = await db.insert(authSessions).values({
      userId: user.id,
      refreshTokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      ...clientInfo(req),
    }).returning({ id: authSessions.id });

    return { accessToken: this.signAccessToken(user, session.id), refreshToken, sessionId: session.id };
  }

  /** Обменивает refresh-токен на новую пару токенов. */
  async refresh(refreshToken: string, req: Request): Promise<IssuedTokens & { userId: string }> {
    const invalid = new SessionError("Сессия недействительна, войдите снова");
    const concurrent = new ConcurrentRefreshError("Сессия уже обновлена другим запросом");
    const tokenHash = hashToken(refreshToken);
    const now = new Date();

    const [session] = await db.select().from(authSessions).where(eq(authSessions.refreshTokenHash, tokenHash));
    if (!session) return this.replay(refreshToken, tokenHash, now, invalid, concurrent);
    if (session.revokedAt || session.expiresAt <= now) throw invalid;

    const nextToken = crypto.randomBytes(32).toString("base64url");
    // Условие на текущий хеш: из двух одновременных обновлений одним токеном выигрывает одно
    const [rotated] = await db.update(authSessions)
      .set({
        refreshTokenHash: hashToken(nextToken),
        previousTokenHash: tokenHash,
        replayTokenEnc: sealReplayToken(nextToken, refreshToken),
        rotatedAt: now,
        lastUsedAt: now,
        expiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_MS),
        ...clientInfo(req),
      })
      .where(and(eq(authSessions.id, session.id), eq(authSessions.refreshTokenHash, tokenHash), isNull(authSessions.revokedAt)))
      .returning({ id: authSessions.id });
    // Проиграли гонку с параллельным обновлением тем же токеном — получим его результат
    if (!rotated) return this.replay(refreshToken, tokenHash, now, invalid, concurrent);

    return {
      accessToken: this.signAccessToken({ id: session.userId }, session.id),
      refreshToken: nextToken,
      sessionId: session.id,
      userId: session.userId,
    };
  }

  /**
   * Заменённый токен предъявлен снова. В течение ROTATION_GRACE_MS — та же новая пара (токен уже выдан
   * параллельному запросу или ответ потерялся); позже — признак кражи, сессия отзывается.
   */
  private async replay(
    refreshToken: string,
    tokenHash: string,
    now: Date,
    invalid: SessionError,
    concurrent: ConcurrentRefreshError,
  ): Promise<IssuedTokens & { userId: string }> {
    const [session] = await db.select().from(authSessions).where(eq(authSessions.previousTokenHash, tokenHash));
    if (!session || session.revokedAt || session.expiresAt <= now) throw invalid;
    const rotatedAgo = session.rotatedAt ? now.getTime() - session.rotatedAt.getTime() : Infinity;
    if (rotatedAgo > ROTATION_GRACE_MS) {
      await db.update(authSessions).set(revokedSessionFields(now)).where(eq(authSessions.id, session.id));
      throw invalid;
    }
    const nextToken = session.replayTokenEnc ? openReplayToken(session.replayTokenEnc, refreshToken) : null;
    if (!nextToken) throw concurrent;
    return {
      accessToken: this.signAccessToken({ id: session.userId }, session.id),
      refreshToken: nextToken,
      sessionId: session.id,
      userId: session.userId,
    };
  }

  /** Сессия из access-токена активна: не отозвана, не истекла и принадлежит пользователю. */
  async isActive(sessionId: string, userId: string): Promise<boolean> {
    const [session] = await db.select({ id: authSessions.id }).from(authSessions).where(and(
      eq(authSessions.id, sessionId),
      eq(authSessions.userId, userId),
      isNull(authSessions.revokedAt),
      gt(authSessions.expiresAt, new Date()),
    ));
    return Boolean(session);
  }

  async revoke(sessionId: string, userId: string): Promise<boolean> {
    const revoked = await db.update(authSessions)
      .set(revokedSessionFields(new Date()))
      .where(and(eq(authSessions.id, sessionId), eq(authSessions.userId, userId), isNull(authSessions.revokedAt)))
      .returning({ id: authSessions.id });
    return revoked.length > 0;
  }

  async revokeByRefreshToken(refreshToken: string): Promise<void> {
    await db.update(authSessions)
      .set(revokedSessionFields(new Date()))
      .where(and(eq(authSessions.refreshTokenHash, hashToken(refreshToken)), isNull(authSessions.revokedAt)));
  }

  /** Отзывает все сессии пользователя, кроме указанной (если передана). */
  async revokeAll(userId: string, exceptSessionId?: string): Promise<number> {
    const conditions = [eq(authSessions.userId, userId), isNull(authSessions.revokedAt)];
    if (exceptSessionId) conditions.push(ne(authSessions.id, exceptSessionId));
    const revoked = await db.update(authSessions)
      .set(revokedSessionFields(new Date()))
      .where(and(...conditions))
      .returning({ id: authSessions.id });
    return revoked.length;
  }

  /** Удаляет сессии, истёкшие или отозванные раньше чем `days` дней назад. Возвращает число удалённых. */
  async purgeStale(days: number): Promise<number> {
    const before = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const deleted = await db.delete(authSessions)
      .where(or(lt(authSessions.expiresAt, before), lt(authSessions.revokedAt, before)))
      .returning({ id: authSessions.id });
    return deleted.length;
  }

  async list(userId: string, currentSessionId?: string): Promise<SessionInfo[]> {
    const rows: AuthSession[] = await db.select().from(authSessions).where(and(
      eq(authSessions.userId, userId),
      isNull(authSessions.revokedAt),
      gt(authSessions.expiresAt, new Date()),
    )).orderBy(desc(authSessions.lastUsedAt));

    return rows.map((row) => ({
      id: row.id,
      deviceName: row.deviceName,
      ipAddress: row.ipAddress,
      createdAt: row.createdAt,
      lastUsedAt: row.lastUsedAt,
      current: row.id === currentSessionId,
    }));
  }
}

export const sessionService = new SessionService();
