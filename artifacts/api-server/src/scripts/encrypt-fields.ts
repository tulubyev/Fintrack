/**
 * Разовая миграция: шифрует уже сохранённые СНИЛС, ИНН, секреты 2FA, резервные коды
 * и банковские токены. Повторный запуск ничего не меняет.
 *
 * Запуск в контейнере API (там есть DATABASE_URL и ENCRYPTION_KEY):
 *   docker exec fintrack-api node dist/scripts/encrypt-fields.mjs --dry-run
 *   docker exec fintrack-api node dist/scripts/encrypt-fields.mjs
 */
import { eq, isNotNull, or } from "drizzle-orm";
import { bankConnections, users } from "@shared/schema";
import { db, pool } from "../db";
import { isEncrypted, protectBankTokens, protectUserFields } from "../services/fieldEncryption";

const dryRun = process.argv.includes("--dry-run");

const needsWork = (value: string | null) => value != null && !isEncrypted(value);

async function main() {
  let usersChanged = 0;
  let connectionsChanged = 0;

  await db.transaction(async (tx) => {
    const userRows = await tx
      .select({
        id: users.id,
        snils: users.snils,
        inn: users.inn,
        twoFactorSecret: users.twoFactorSecret,
        twoFactorBackupCodes: users.twoFactorBackupCodes,
      })
      .from(users)
      .where(or(isNotNull(users.snils), isNotNull(users.inn), isNotNull(users.twoFactorSecret), isNotNull(users.twoFactorBackupCodes)));

    for (const row of userRows) {
      const updates: Partial<typeof row> = {};
      if (needsWork(row.snils)) updates.snils = row.snils;
      if (needsWork(row.inn)) updates.inn = row.inn;
      if (needsWork(row.twoFactorSecret)) updates.twoFactorSecret = row.twoFactorSecret;
      if (row.twoFactorBackupCodes?.some((code) => !code.startsWith("h:v1:"))) updates.twoFactorBackupCodes = row.twoFactorBackupCodes;
      if (Object.keys(updates).length === 0) continue;

      usersChanged++;
      if (!dryRun) await tx.update(users).set(protectUserFields(updates)).where(eq(users.id, row.id));
    }

    const connectionRows = await tx
      .select({ id: bankConnections.id, accessToken: bankConnections.accessToken, refreshToken: bankConnections.refreshToken })
      .from(bankConnections)
      .where(or(isNotNull(bankConnections.accessToken), isNotNull(bankConnections.refreshToken)));

    for (const row of connectionRows) {
      const updates: Partial<typeof row> = {};
      if (needsWork(row.accessToken)) updates.accessToken = row.accessToken;
      if (needsWork(row.refreshToken)) updates.refreshToken = row.refreshToken;
      if (Object.keys(updates).length === 0) continue;

      connectionsChanged++;
      if (!dryRun) await tx.update(bankConnections).set(protectBankTokens(updates)).where(eq(bankConnections.id, row.id));
    }
  });

  const verb = dryRun ? "будет зашифровано" : "зашифровано";
  console.log(`Пользователей: ${verb} ${usersChanged}. Банковских подключений: ${verb} ${connectionsChanged}.`);
}

main()
  .catch((error) => {
    console.error("Миграция не выполнена, изменения откатаны:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
