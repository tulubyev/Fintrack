import Constants, { ExecutionEnvironment } from "expo-constants";
import * as Device from "expo-device";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { createApiClient } from "@workspace/shared/api";
import { API_URL, APP_VERSION } from "@/lib/config";
import { AuthController, type Biometrics, type BiometricsPolicy, type SecureKeyValue } from "./controller";
import { hashPin, verifyPin } from "./pin";

/** Keystore на Android, Keychain на iOS; на iOS — только на этом устройстве и только после разблокировки. */
const OPTIONS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

const storage: SecureKeyValue = {
  get: (key) => SecureStore.getItemAsync(key, OPTIONS),
  set: (key, value) => (value === null ? SecureStore.deleteItemAsync(key, OPTIONS) : SecureStore.setItemAsync(key, value, OPTIONS)),
};

// Face ID в Expo Go на iPhone не работает (нет NSFaceIDUsageDescription) — не предлагаем то, что не сработает
const faceIdUnavailable = Platform.OS === "ios" && Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

const biometrics: Biometrics = {
  available: async () =>
    !faceIdUnavailable && (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync()),
  authenticate: async () => {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: "Вход в FinTrack",
      cancelLabel: "PIN-код",
      disableDeviceFallback: true,
    });
    return result.success;
  },
};

/**
 * Разрешение сервера на биометрию (D20, /api/v1/app-config). Последний ответ хранится на устройстве:
 * без сети действует он, а до первого ответа — «запрещено».
 */
const POLICY_KEY = "policy.biometrics";
const policy: BiometricsPolicy = {
  cached: async () => (await storage.get(POLICY_KEY)) === "1",
  refresh: async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5_000);
    try {
      const response = await fetch(`${API_URL}/api/v1/app-config`, { signal: controller.signal, credentials: "omit" });
      if (!response.ok) return policy.cached();
      const allowed = (await response.json()).mobileBiometricsEnabled === true;
      await storage.set(POLICY_KEY, allowed ? "1" : null);
      return allowed;
    } catch {
      return policy.cached();
    } finally {
      clearTimeout(timer);
    }
  },
};

/** Видно в списке сессий на сайте: «FinTrack/0.1.0 (Android 15; Pixel 8)». */
const userAgent = `FinTrack/${APP_VERSION} (${Device.osName ?? "Android"} ${Device.osVersion ?? ""}; ${Device.modelName ?? "unknown"})`;

export const auth = new AuthController({
  storage,
  biometrics,
  policy,
  pin: { hash: (pin) => hashPin(pin), verify: verifyPin },
  createClient: (session, onSessionExpired) =>
    createApiClient({ baseUrl: API_URL, session, onSessionExpired, headers: { "User-Agent": userAgent } }),
});

export const api = auth.client.request;
