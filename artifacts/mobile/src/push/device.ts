import { requireOptionalNativeModule, type EventSubscription } from "expo";
import { Platform } from "react-native";
import { api, auth } from "@/auth/device";
import { FLAVOR } from "@/lib/config";
import { registerPush, sendToken, type PushNative } from "./register";

interface FinTrackPushModule extends PushNative {
  addListener(event: "onNewToken", listener: (event: { token: string }) => void): EventSubscription;
}

/** Нативный модуль modules/fintrack-push — только в сборке под Android; в Expo Go и на iOS его нет. */
const native = Platform.OS === "android" ? requireOptionalNativeModule<FinTrackPushModule>("FinTrackPush") : null;

/**
 * Push-токен на сервер: после входа и каждой разблокировки, и когда RuStore выпустил новый токен.
 * Ошибки (нет сети, RuStore недоступен) не мешают работе — попробуем при следующей разблокировке.
 */
export function startPushRegistration(): () => void {
  let ready = false;
  let provider: Awaited<ReturnType<typeof registerPush>> = null;

  const onAuth = () => {
    const isReady = auth.getState().status === "ready";
    if (isReady && !ready) {
      ready = true;
      void registerPush(native, FLAVOR, api).then((result) => (provider = result), () => undefined);
    } else if (!isReady) {
      ready = false;
    }
  };
  const unsubscribeAuth = auth.subscribe(onAuth);
  onAuth();

  const newToken = native?.addListener("onNewToken", ({ token }) => {
    if (ready && provider === "rustore") void sendToken(api, "rustore", token).catch(() => undefined);
  });

  return () => {
    unsubscribeAuth();
    newToken?.remove();
  };
}
