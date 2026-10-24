import { useEffect } from "react";
import { AppState, StyleSheet, View } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { auth } from "@/auth/device";
import { startDataSync } from "@/data/device";
import { LockScreen } from "@/auth/LockScreen";
import { LoginScreen } from "@/auth/LoginScreen";
import { PinSetupScreen } from "@/auth/PinSetupScreen";
import { useAuth } from "@/auth/useAuth";
import { PRIMARY, useColors } from "@/ui/kit";

/** Экраны стека с заголовком и кнопкой «назад»; вкладки — в (tabs)/_layout.tsx. Пути повторяют сайт (lib/links.ts). */
const STACK_SCREENS: [string, string][] = [
  ["transactions/[id]", "Операция"],
  ["accounts/index", "Счета"],
  ["accounts/[id]", "Счёт"],
  ["budgets/[id]", "Бюджет"],
  ["goals", "Цели"],
  ["subscriptions/index", "Подписки"],
  ["subscriptions/[id]", "Регулярный платёж"],
  ["categories/index", "Категории"],
  ["categories/rules", "Правила категорий"],
  ["import", "Импорт выписки"],
  ["settings", "Настройки"],
  ["sync-issues", "Нужно ваше решение"],
];

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
    const stopSync = startDataSync();
    return () => {
      subscription.remove();
      stopSync();
    };
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerShown: false,
          headerStyle: { backgroundColor: colors.card },
          headerTintColor: PRIMARY,
          headerTitleStyle: { color: colors.foreground },
          headerBackTitle: "Назад",
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="quick-add" options={{ presentation: "modal", headerShown: true, title: "Новая операция" }} />
        <Stack.Screen name="category-picker" options={{ presentation: "modal", headerShown: true, title: "Категория" }} />
        {STACK_SCREENS.map(([name, title]) => (
          <Stack.Screen key={name} name={name} options={{ headerShown: true, title }} />
        ))}
      </Stack>
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
