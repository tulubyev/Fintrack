import { useEffect, useSyncExternalStore } from "react";
import { Platform } from "react-native";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { requireOptionalNativeModule, type EventSubscription } from "expo";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { router } from "expo-router";
import { api, auth } from "@/auth/device";
import { useAuth } from "@/auth/useAuth";
import { sync } from "@/data/device";
import { FLAVOR } from "@/lib/config";
import { isSyncPush, pushPath, shouldOfferReminders } from "./notifications";
import { registerPush, sendToken, type PushDeps, type PushProviderName } from "./register";

interface FinTrackPushModule {
  hasGooglePlayServices(): boolean;
  ruStoreAvailable(): Promise<boolean>;
  ruStoreToken(): Promise<string | null>;
  addListener(event: "onNewToken", listener: (event: { token: string }) => void): EventSubscription;
  addListener(event: "onDataMessage", listener: (event: { data: Record<string, string> }) => void): EventSubscription;
}

/** Нативный модуль modules/fintrack-push (RuStore) — только в сборке под Android. */
const native = Platform.OS === "android" ? requireOptionalNativeModule<FinTrackPushModule>("FinTrackPush") : null;
/** В Expo Go удалённых push нет (Android с SDK 53) — там ничего не регистрируем. */
const pushSupported = Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;

const CHANNEL_ID = "default";
const DISMISSED_KEY = "push.reminderDismissedAt";

async function deviceToken(): Promise<string | null> {
  if (!pushSupported) return null;
  // на iOS токен APNs без разрешения не выдаётся; на Android токен FCM от разрешения не зависит
  if (Platform.OS === "ios" && (await Notifications.getPermissionsAsync()).status !== "granted") return null;
  try {
    const token = await Notifications.getDevicePushTokenAsync();
    return typeof token.data === "string" ? token.data : null;
  } catch {
    return null; // нет google-services.json — Firebase не запущен
  }
}

const deps: PushDeps = {
  platform: Platform.OS,
  flavor: FLAVOR,
  hasGooglePlayServices: () => native?.hasGooglePlayServices() ?? false,
  ruStoreAvailable: async () => (native ? native.ruStoreAvailable().catch(() => false) : false),
  ruStoreToken: async () => (native ? native.ruStoreToken().catch(() => null) : null),
  deviceToken,
  request: api,
};

let provider: PushProviderName | null = null;
let ready = false;

/** Токен на сервер; ошибки (нет сети, провайдер недоступен) не мешают — повторим при следующей разблокировке. */
function register() {
  if (!pushSupported || !ready) return;
  void registerPush(deps).then((result) => (provider = result), () => undefined);
}

// ---------- переход по нажатию на уведомление ----------

let pendingPath: string | null = null;
const pendingListeners = new Set<() => void>();
function setPendingPath(path: string | null) {
  pendingPath = path;
  pendingListeners.forEach((listener) => listener());
}

function openFromResponse(response: Notifications.NotificationResponse | null) {
  if (!response) return;
  const { content, trigger } = response.notification.request;
  // FCM кладёт данные и в content.data, и в remoteMessage — берём что есть
  const remote = trigger && "remoteMessage" in trigger ? (trigger.remoteMessage as { data?: Record<string, string> } | undefined) : undefined;
  const path = pushPath(content.data) ?? pushPath(remote?.data);
  if (path) setPendingPath(path);
}

/**
 * Открыть экран из уведомления, когда приложение разблокировано: при холодном старте и после PIN-кода переход
 * ждёт статуса ready. Уведомления RuStore открывают экран сами — через deep link fintrack://… в click_action.
 */
export function usePushOpen(): void {
  const { status } = useAuth();
  const path = useSyncExternalStore(
    (listener) => {
      pendingListeners.add(listener);
      return () => pendingListeners.delete(listener);
    },
    () => pendingPath,
  );
  useEffect(() => {
    if (status !== "ready" || !path) return;
    setPendingPath(null);
    router.push(path as never);
  }, [status, path]);
}

// ---------- запуск ----------

/**
 * Push в приложении: токен на сервер после входа, при каждой разблокировке и при смене токена;
 * нажатие на уведомление открывает его экран; тихий push «данные обновились» запускает синхронизацию.
 */
export function startPush(): () => void {
  const subscriptions: { remove(): void }[] = [];

  if (pushSupported) {
    // уведомление при открытом приложении: обычное — показываем, тихое — нет
    Notifications.setNotificationHandler({
      handleNotification: async (notification) => {
        const show = !isSyncPush(notification.request.content.data);
        return { shouldShowBanner: show, shouldShowList: show, shouldPlaySound: show, shouldSetBadge: false };
      },
    });
    if (Platform.OS === "android") {
      void Notifications.setNotificationChannelAsync(CHANNEL_ID, { name: "Уведомления", importance: Notifications.AndroidImportance.DEFAULT })
        .catch(() => undefined);
    }
    openFromResponse(Notifications.getLastNotificationResponse());
    subscriptions.push(
      Notifications.addNotificationResponseReceivedListener(openFromResponse),
      Notifications.addNotificationReceivedListener((notification) => {
        if (isSyncPush(notification.request.content.data)) void sync.sync({ now: true });
      }),
      Notifications.addPushTokenListener((token) => {
        if (ready && (provider === "fcm" || provider === "apns") && typeof token.data === "string") {
          void sendToken(api, provider, token.data).catch(() => undefined);
        }
      }),
    );
  }
  if (native) {
    subscriptions.push(
      native.addListener("onNewToken", ({ token }) => {
        if (ready && provider === "rustore") void sendToken(api, "rustore", token).catch(() => undefined);
      }),
      native.addListener("onDataMessage", ({ data }) => {
        if (isSyncPush(data)) void sync.sync({ now: true });
      }),
    );
  }

  const onAuth = () => {
    const isReady = auth.getState().status === "ready";
    if (isReady && !ready) {
      ready = true;
      register();
    } else if (!isReady) {
      ready = false;
    }
  };
  const unsubscribeAuth = auth.subscribe(onAuth);
  onAuth();

  return () => {
    unsubscribeAuth();
    subscriptions.forEach((subscription) => subscription.remove());
  };
}

// ---------- разрешение после первой ценности ----------

/** Нужно ли сейчас предложить включить уведомления (Android 13+ и iOS спрашивают разрешение). */
export async function reminderOffered(): Promise<boolean> {
  if (!pushSupported) return false;
  const [permission, dismissed] = await Promise.all([Notifications.getPermissionsAsync(), SecureStore.getItemAsync(DISMISSED_KEY)]);
  return shouldOfferReminders({
    status: permission.status as "granted" | "denied" | "undetermined",
    canAskAgain: permission.canAskAgain,
    dismissedAt: dismissed ? Number(dismissed) : null,
    now: Date.now(),
  });
}

/** «Напомнить»: системный запрос разрешения; разрешили — заново регистрируем токен (APNs без разрешения его не даёт). */
export async function acceptReminders(): Promise<boolean> {
  const { status } = await Notifications.requestPermissionsAsync();
  if (status === "granted") register();
  else await dismissReminders();
  return status === "granted";
}

export const dismissReminders = () => SecureStore.setItemAsync(DISMISSED_KEY, String(Date.now()));
