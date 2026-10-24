import type { ConfigContext, ExpoConfig } from "expo/config";

/**
 * Варианты сборки (E2.1): rustore и play — для сторов, apk — для скачивания с сайта.
 * С E2.3 у них разойдутся разрешения (чтение уведомлений банков), пока отличаются только названием в extra.
 */
const FLAVORS = ["rustore", "play", "apk"] as const;
type Flavor = (typeof FLAVORS)[number];

const flavor = (process.env.EXPO_PUBLIC_FLAVOR ?? "apk") as Flavor;
if (!FLAVORS.includes(flavor)) {
  throw new Error(`EXPO_PUBLIC_FLAVOR должен быть одним из: ${FLAVORS.join(", ")}`);
}

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "FinTrack",
  slug: "fintrack",
  version: "0.1.0",
  orientation: "portrait",
  scheme: "fintrack",
  userInterfaceStyle: "automatic",
  android: {
    // Идентификатор нельзя сменить после публикации в сторах (E2.9)
    package: "ru.finwall.app",
    versionCode: Number(process.env.ANDROID_VERSION_CODE ?? 1),
    predictiveBackGestureEnabled: false,
    // App Links (E2.1-T6): https://fin-wall.ru/app/… открывается в приложении без выбора. Проверку домена Android
    // делает по /.well-known/assetlinks.json — его раздаёт web-контейнер, когда задан ANDROID_CERT_SHA256 (docs/DEPLOY.md)
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        data: [{ scheme: "https", host: "fin-wall.ru", pathPrefix: "/app" }],
        category: ["BROWSABLE", "DEFAULT"],
      },
    ],
  },
  ios: {
    bundleIdentifier: "ru.finwall.app",
    // Universal Links — когда появится сборка под iOS с командой Apple (APPLE_TEAM_ID); без неё не подписать entitlement
    ...(process.env.APPLE_TEAM_ID ? { associatedDomains: ["applinks:fin-wall.ru"] } : {}),
  },
  plugins: [
    "expo-router",
    // Токены и хеш PIN не попадают в резервную копию Android: на новом устройстве ключа Keystore всё равно нет
    ["expo-secure-store", { configureAndroidBackup: true }],
    // Локальная база шифруется (E2.1-T5): без SQLCipher сборка данные не хранит; в Expo Go его нет — там без шифрования
    ["expo-sqlite", { useSQLCipher: true }],
    ["expo-local-authentication", { faceIDPermission: "FinTrack открывается по Face ID вместо PIN-кода" }],
    // «Поделиться» выпиской из банковского приложения (E2.1-T9): FinTrack в списке получателей для PDF, CSV и Excel.
    // Файл модуль копирует в кеш приложения; iOS-расширение не собираем, пока нет сборки под iOS
    [
      "expo-share-intent",
      {
        androidIntentFilters: [
          "application/pdf",
          "text/csv",
          "text/comma-separated-values",
          "application/vnd.ms-excel",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ],
        disableIOS: true,
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    flavor,
  },
});
