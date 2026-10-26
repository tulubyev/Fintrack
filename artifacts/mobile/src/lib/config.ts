import Constants from "expo-constants";

/** Адрес API задаётся при сборке (EXPO_PUBLIC_API_URL), по умолчанию — прод. */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? "https://fin-wall.ru").replace(/\/+$/, "");

/** Публичный сайт (E1.8): документы, регистрация и восстановление пароля. */
export const SITE_URL = "https://fin-wall.ru";
export const LEGAL_LINKS = [
  { title: "Политика обработки персональных данных", url: `${SITE_URL}/legal/privacy` },
  { title: "Пользовательское соглашение", url: `${SITE_URL}/legal/terms` },
] as const;

export const APP_VERSION = Constants.expoConfig?.version ?? "0.0.0";

export const FLAVOR = String(Constants.expoConfig?.extra?.flavor ?? "apk");
