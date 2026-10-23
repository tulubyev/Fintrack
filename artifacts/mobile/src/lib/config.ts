import Constants from "expo-constants";

/** Адрес API задаётся при сборке (EXPO_PUBLIC_API_URL), по умолчанию — прод. */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? "https://fin-wall.ru").replace(/\/+$/, "");

export const APP_VERSION = Constants.expoConfig?.version ?? "0.0.0";

export const FLAVOR = String(Constants.expoConfig?.extra?.flavor ?? "apk");
