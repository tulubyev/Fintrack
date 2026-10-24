import { useEffect } from "react";
import { AppState, StyleSheet, View } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { auth } from "@/auth/device";
import { LockScreen } from "@/auth/LockScreen";
import { LoginScreen } from "@/auth/LoginScreen";
import { PinSetupScreen } from "@/auth/PinSetupScreen";
import { useAuth } from "@/auth/useAuth";
import { useColors } from "@/ui/kit";

/**
 * Вход поверх навигации (E2.1-T3): без сессии — экран входа, после входа — PIN,
 * блокировка закрывает приложение целиком, не сбрасывая открытый экран.
 * Навигатор смонтирован всегда — так expo-router принимает deep link и до входа.
 */
export default function RootLayout() {
  const { status } = useAuth();
  const colors = useColors();

  useEffect(() => {
    void auth.init();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "background") auth.onBackground();
      if (state === "active") auth.onForeground();
    });
    return () => subscription.remove();
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }} />
      {status !== "ready" && status !== "locked" && (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]}>
          {status === "signedOut" && <LoginScreen />}
          {status === "pinSetup" && <PinSetupScreen />}
        </View>
      )}
      {status === "locked" && <LockScreen />}
    </View>
  );
}
