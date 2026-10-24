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
  },
  ios: {
    bundleIdentifier: "ru.finwall.app",
  },
  plugins: [
    "expo-router",
    // Токены и хеш PIN не попадают в резервную копию Android: на новом устройстве ключа Keystore всё равно нет
    ["expo-secure-store", { configureAndroidBackup: true }],
    ["expo-local-authentication", { faceIDPermission: "FinTrack открывается по Face ID вместо PIN-кода" }],
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    flavor,
  },
});
