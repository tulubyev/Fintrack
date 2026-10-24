/**
 * Системные настройки: значение по умолчанию — переменная .env, администратор может перекрыть его в кабинете
 * (таблица app_settings). Сброс в кабинете возвращает значение из .env.
 *
 * mobileBiometrics — вход по отпечатку или Face ID в приложении. Позиция владельца (D20): приложения не собирают
 * биометрию, поэтому по умолчанию выключено; включается MOBILE_BIOMETRICS_ENABLED=true или администратором.
 */
import { eq } from "drizzle-orm";
import { appSettings } from "@shared/schema";
import { db } from "../db";

const SETTINGS = {
  mobileBiometrics: { key: "mobile.biometrics", env: "MOBILE_BIOMETRICS_ENABLED" },
} as const;

export type SettingName = keyof typeof SETTINGS;

export interface BooleanSetting {
  enabled: boolean;
  /** Откуда значение: администратор в кабинете или .env. */
  source: "admin" | "env";
  /** Значение из .env — к нему вернёт сброс. */
  envDefault: boolean;
}

const envFlag = (name: string) => process.env[name]?.trim().toLowerCase() === "true";

export async function getBooleanSetting(name: SettingName): Promise<BooleanSetting> {
  const { key, env } = SETTINGS[name];
  const [row] = await db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, key));
  const envDefault = envFlag(env);
  return typeof row?.value === "boolean"
    ? { enabled: row.value, source: "admin", envDefault }
    : { enabled: envDefault, source: "env", envDefault };
}

/** null — убрать значение администратора и вернуться к .env. */
export async function setBooleanSetting(name: SettingName, value: boolean | null, adminId: string): Promise<BooleanSetting> {
  const { key } = SETTINGS[name];
  if (value === null) {
    await db.delete(appSettings).where(eq(appSettings.key, key));
  } else {
    await db.insert(appSettings).values({ key, value, updatedBy: adminId })
      .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedBy: adminId, updatedAt: new Date() } });
  }
  return getBooleanSetting(name);
}
