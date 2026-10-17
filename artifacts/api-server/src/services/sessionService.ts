import crypto from "crypto";
import jwt from "jsonwebtoken";
import type { Request, Response } from "express";
import { and, desc, eq, gt, isNull, ne } from "drizzle-orm";
import { authSessions, type AuthSession, type User } from "@shared/schema";
import { db } from "../db";
import { config } from "../../config/environment";

/**
 * Сессии входа.
 *
 * Access-токен — JWT на 15 минут с id сессии (`sid`): отозванная сессия перестаёт
 * работать сразу, а не после истечения токена. Refresh-токен — случайная строка
 * на 30 дней; в БД хранится только его хеш. При каждом обновлении refresh-токен
 * меняется. Если кто-то предъявит уже заменённый токен (его украли и использовали
 * раньше владельца или наоборот), сессия отзывается целиком.
 */

export const ACCESS_TOKEN_TTL = "15m";
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
// Две вкладки могут обновить токен одновременно: старый токен в этом окне
// отклоняется без отзыва сессии
const ROTATION_GRACE_MS = 60 * 1000;

export class SessionError extends Error {}

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
    const tokenHash = hashToken(refreshToken);
    const now = new Date();

    const [session] = await db.select().from(authSessions).where(eq(authSessions.refreshTokenHash, tokenHash));
    if (!session) {
      await this.handleReplayedToken(tokenHash, now);
      throw invalid;
    }
    if (session.revokedAt || session.expiresAt <= now) throw invalid;

    const nextToken = crypto.randomBytes(32).toString("base64url");
    // Условие на текущий хеш: из двух одновременных обновлений одним токеном выигрывает одно
    const [rotated] = await db.update(authSessions)
      .set({
        refreshTokenHash: hashToken(nextToken),
        previousTokenHash: tokenHash,
        rotatedAt: now,
        lastUsedAt: now,
        expiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_MS),
        ...clientInfo(req),
      })
      .where(and(eq(authSessions.id, session.id), eq(authSessions.refreshTokenHash, tokenHash), isNull(authSessions.revokedAt)))
      .returning({ id: authSessions.id });
    if (!rotated) throw invalid;

    return {
      accessToken: this.signAccessToken({ id: session.userId }, session.id),
      refreshToken: nextToken,
      sessionId: session.id,
      userId: session.userId,
    };
  }

  /** Заменённый токен предъявлен снова: вне окна одновременных обновлений это признак кражи. */
  private async handleReplayedToken(tokenHash: string, now: Date) {
    const [session] = await db.select().from(authSessions).where(eq(authSessions.previousTokenHash, tokenHash));
    if (!session || session.revokedAt) return;
    const rotatedAgo = session.rotatedAt ? now.getTime() - session.rotatedAt.getTime() : Infinity;
    if (rotatedAgo > ROTATION_GRACE_MS) {
      await db.update(authSessions).set({ revokedAt: now }).where(eq(authSessions.id, session.id));
    }
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
      .set({ revokedAt: new Date() })
      .where(and(eq(authSessions.id, sessionId), eq(authSessions.userId, userId), isNull(authSessions.revokedAt)))
      .returning({ id: authSessions.id });
    return revoked.length > 0;
  }

  async revokeByRefreshToken(refreshToken: string): Promise<void> {
    await db.update(authSessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(authSessions.refreshTokenHash, hashToken(refreshToken)), isNull(authSessions.revokedAt)));
  }

  /** Отзывает все сессии пользователя, кроме указанной (если передана). */
  async revokeAll(userId: string, exceptSessionId?: string): Promise<number> {
    const conditions = [eq(authSessions.userId, userId), isNull(authSessions.revokedAt)];
    if (exceptSessionId) conditions.push(ne(authSessions.id, exceptSessionId));
    const revoked = await db.update(authSessions)
      .set({ revokedAt: new Date() })
      .where(and(...conditions))
      .returning({ id: authSessions.id });
    return revoked.length;
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
