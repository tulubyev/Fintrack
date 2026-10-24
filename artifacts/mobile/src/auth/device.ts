import * as Device from "expo-device";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import { createApiClient } from "@workspace/shared/api";
import { API_URL, APP_VERSION } from "@/lib/config";
import { AuthController, type Biometrics, type SecureKeyValue } from "./controller";
import { hashPin, verifyPin } from "./pin";

/** Keystore на Android, Keychain на iOS; на iOS — только на этом устройстве и только после разблокировки. */
const OPTIONS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

const storage: SecureKeyValue = {
  get: (key) => SecureStore.getItemAsync(key, OPTIONS),
  set: (key, value) => (value === null ? SecureStore.deleteItemAsync(key, OPTIONS) : SecureStore.setItemAsync(key, value, OPTIONS)),
};

const biometrics: Biometrics = {
  available: async () => (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync()),
  authenticate: async () => {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: "Вход в FinTrack",
      cancelLabel: "PIN-код",
      disableDeviceFallback: true,
    });
    return result.success;
  },
};

/** Видно в списке сессий на сайте: «FinTrack/0.1.0 (Android 15; Pixel 8)». */
const userAgent = `FinTrack/${APP_VERSION} (${Device.osName ?? "Android"} ${Device.osVersion ?? ""}; ${Device.modelName ?? "unknown"})`;

export const auth = new AuthController({
  storage,
  biometrics,
  pin: { hash: (pin) => hashPin(pin), verify: verifyPin },
  createClient: (session, onSessionExpired) =>
    createApiClient({ baseUrl: API_URL, session, onSessionExpired, headers: { "User-Agent": userAgent } }),
});

export const api = auth.client.request;
