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

// FCM (E2.2-T4): google-services.json проекта Firebase; путь — в GOOGLE_SERVICES_FILE (в CI файл собирается из секрета).
// Без файла Firebase не запускается: push через FCM недоступен, на телефонах с RuStore остаётся RuStore Push
const googleServicesFile = process.env.GOOGLE_SERVICES_FILE?.trim() || undefined;

// RuStore Push (E2.2-T3): ID проекта из RuStore Консоли (не секрет — он виден в APK). Сборка play идёт через FCM
const rustorePushProjectId = flavor === "play" ? undefined : process.env.RUSTORE_PUSH_PROJECT_ID?.trim() || undefined;

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "FinTrack",
  slug: "fintrack",
  version: "0.1.0",
  orientation: "portrait",
  scheme: "fintrack",
  userInterfaceStyle: "automatic",
  // Иконка — знак «Грань» (фирменный стиль, docs/brand/03-logo.md); PNG — из материалов стиля, SVG-исходники — docs/brand
  icon: "./assets/icon-1024.png",
  android: {
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-foreground-1024.png",
      backgroundImage: "./assets/adaptive-background-1024.png",
      // тематические иконки Android 13+
      monochromeImage: "./assets/adaptive-monochrome-1024.png",
    },
    // Идентификатор нельзя сменить после публикации в сторах (E2.9)
    package: "ru.finwall.app",
    ...(googleServicesFile ? { googleServicesFile } : {}),
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
    // сплэш со знаком «Грань» в обеих темах (фирменный стиль, #172); прячет его корневой _layout после загрузки шрифтов
    [
      "expo-splash-screen",
      {
        image: "./assets/splash-icon-light-1024.png",
        imageWidth: 160,
        backgroundColor: "#F6F8F8",
        dark: { image: "./assets/splash-icon-dark-1024.png", backgroundColor: "#0E1314" },
      },
    ],
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
    // push (E2.2-T4): токен FCM и APNs, разрешение, нажатие на уведомление. Значок — белый знак «Грань», цвет — primarySolid
    ["expo-notifications", { icon: "./assets/notification-icon-96.png", color: "#107D86", defaultChannel: "default" }],
    // push через RuStore для Android без сервисов Google и сборки rustore; нативный модуль — modules/fintrack-push
    ["./plugins/withRuStorePush", { projectId: rustorePushProjectId }],
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    flavor,
  },
});
