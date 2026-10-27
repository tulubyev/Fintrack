/**
 * Удаление аккаунта со всеми данными (E1.0-T6, ч. 5 ст. 21 152-ФЗ): по запросу пользователя или при отзыве согласия.
 * Строки удаляет каскад внешних ключей от users (миграция 0025_user_cascade); у документов ключа на users нет
 * (user_id — varchar), их удаляем явно, история проверок уходит каскадом от documents. Ссылки администратора
 * (журнал, проверка чужих заявок, системные настройки) обнуляются, чужие данные не трогаются.
 * Файлы — зашифрованные документы, выписки и фото профиля — стираются после фиксации транзакции: если файл
 * не удалился, данных в базе уже нет, а сбой пишется в лог.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { documents, users } from "@shared/schema";
import { config } from "../../config/environment";
import { db } from "../db";
import { documentStorageService } from "./documentStorageService";
import { removeUserImportFiles } from "./imports/storage";
import { logger } from "./logger";

const PROFILE_IMAGE_PREFIX = "/api/profile/images/";

/** true — аккаунт удалён, false — такого пользователя нет. */
export async function deleteUserAccount(userId: string): Promise<boolean> {
  const removed = await db.transaction(async (tx) => {
    const [user] = await tx.select({ profileImageUrl: users.profileImageUrl }).from(users).where(eq(users.id, userId)).for("update");
    if (!user) return null;
    const files = await tx.delete(documents).where(eq(documents.userId, userId)).returning({ filePath: documents.filePath });
    await tx.delete(users).where(eq(users.id, userId));
    return { documentFiles: files.map((file) => file.filePath), profileImageUrl: user.profileImageUrl };
  });
  if (!removed) return false;

  const failures: string[] = [];
  for (const filePath of removed.documentFiles) {
    if (!(await documentStorageService.deleteDocument(userId, filePath))) failures.push(`документ ${filePath}`);
  }
  await removeUserImportFiles(userId).catch(() => failures.push("файлы выписок"));
  if (removed.profileImageUrl?.startsWith(PROFILE_IMAGE_PREFIX)) {
    // basename: в url только имя файла, но не доверяем ему путь
    const fileName = path.basename(removed.profileImageUrl.slice(PROFILE_IMAGE_PREFIX.length));
    await fs.rm(path.join(config.storage.uploadsDir, "profile-images", fileName), { force: true }).catch(() => failures.push("фото профиля"));
  }
  if (failures.length) logger.error(`Аккаунт ${userId} удалён, но не удалились файлы: ${failures.join(", ")}`);
  else logger.info(`Аккаунт ${userId} удалён со всеми данными`);
  return true;
}
