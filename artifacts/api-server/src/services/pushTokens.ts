/**
 * Push-токены устройств (E2.2-T1). Устройство — это сессия входа (auth_sessions): токен живёт, пока сессия активна,
 * и стирается при выходе или отзыве. Токен зашифрован детерминированно, поэтому он уникален: если на том же телефоне
 * вошёл другой пользователь, токен переезжает к новой сессии и уведомления прежнего владельца туда не уходят.
 */
import { and, eq, gt, isNotNull, isNull, ne } from "drizzle-orm";
import { authSessions } from "@shared/schema";
import { db } from "../db";
import { ApiError } from "../lib/apiError";
import { decryptField, encryptField } from "./fieldEncryption";

export const PUSH_PROVIDERS = ["fcm", "rustore", "apns", "webpush"] as const;
export type PushProvider = (typeof PUSH_PROVIDERS)[number];

const noToken = { pushProvider: null, pushToken: null, pushTokenUpdatedAt: null };

function requireSession(sessionId: string | undefined): string {
  // старые access-токены без sid не привязаны к устройству
  if (!sessionId) throw new ApiError(409, "SESSION_REQUIRED", "Войдите в приложение заново, чтобы включить уведомления");
  return sessionId;
}

export async function setPushToken(userId: string, sessionId: string | undefined, provider: PushProvider, token: string): Promise<void> {
  const sid = requireSession(sessionId);
  const stored = encryptField(token, "push-token", true);
  await db.transaction(async (tx) => {
    await tx.update(authSessions).set(noToken).where(and(eq(authSessions.pushToken, stored), ne(authSessions.id, sid)));
    const updated = await tx.update(authSessions)
      .set({ pushProvider: provider, pushToken: stored, pushTokenUpdatedAt: new Date() })
      .where(and(eq(authSessions.id, sid), eq(authSessions.userId, userId), isNull(authSessions.revokedAt)))
      .returning({ id: authSessions.id });
    if (!updated.length) throw new ApiError(409, "SESSION_REQUIRED", "Войдите в приложение заново, чтобы включить уведомления");
  });
}

export async function clearPushToken(userId: string, sessionId: string | undefined): Promise<void> {
  const sid = requireSession(sessionId);
  await db.update(authSessions).set(noToken).where(and(eq(authSessions.id, sid), eq(authSessions.userId, userId)));
}

export interface PushTarget {
  sessionId: string;
  provider: PushProvider;
  token: string;
}

/** Устройства пользователя, на которые можно слать push: активные сессии с токеном. */
export async function pushTargets(userId: string): Promise<PushTarget[]> {
  const rows = await db.select({ id: authSessions.id, provider: authSessions.pushProvider, token: authSessions.pushToken })
    .from(authSessions)
    .where(and(
      eq(authSessions.userId, userId),
      isNull(authSessions.revokedAt),
      gt(authSessions.expiresAt, new Date()),
      isNotNull(authSessions.pushToken),
    ));
  return rows.map((row) => ({ sessionId: row.id, provider: row.provider as PushProvider, token: decryptField(row.token!, "push-token") }));
}
