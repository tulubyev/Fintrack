import { useEffect } from "react";
import { AppState, StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { router, Stack, usePathname } from "expo-router";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { ShareIntentProvider, useShareIntentContext } from "expo-share-intent";
import { StatusBar } from "expo-status-bar";
import { auth } from "@/auth/device";
import { startDataSync } from "@/data/device";
import { LockScreen } from "@/auth/LockScreen";
import { LoginScreen } from "@/auth/LoginScreen";
import { PinSetupScreen } from "@/auth/PinSetupScreen";
import { useAuth } from "@/auth/useAuth";
import { sharedStatement } from "@/lib/imports";
import { useColors } from "@/ui/kit";

/** Экраны стека с заголовком и кнопкой «назад»; вкладки — в (tabs)/_layout.tsx. Пути повторяют сайт (lib/links.ts). */
const STACK_SCREENS: [string, string][] = [
  ["transactions/[id]/index", "Операция"],
  ["accounts/index", "Счета"],
  ["accounts/[id]", "Счёт"],
  ["budgets/[id]", "Бюджет"],
  ["goals/index", "Цели"],
  ["goals/[id]", "Цель"],
  ["subscriptions/index", "Подписки"],
  ["subscriptions/[id]", "Регулярный платёж"],
  ["categories/index", "Категории"],
  ["categories/rules", "Правила категорий"],
  ["import/index", "Импорт выписки"],
  ["import/[id]", "Импорт выписки"],
  ["settings", "Настройки"],
  ["sync-issues", "Нужно ваше решение"],
];

/** Создание и правка — модальными окнами поверх экрана. */
const MODAL_SCREENS: [string, string][] = [
  ["transactions/[id]/edit", "Изменить операцию"],
  ["budgets/new", "Новый бюджет"],
  ["accounts/new", "Новый счёт"],
  ["goals/new", "Новая цель"],
  ["categories/new", "Своя категория"],
];

/**
 * Вход поверх навигации (E2.1-T3): без сессии — экран входа, после входа — PIN,
 * блокировка закрывает приложение целиком, не сбрасывая открытый экран.
 * Навигатор смонтирован всегда — так expo-router принимает deep link и до входа.
 */
export default function RootLayout() {
  return (
    // «Поделиться» выпиской из банковского приложения (E2.1-T9); в Expo Go нативного модуля нет
    <ShareIntentProvider options={{ disabled: Constants.executionEnvironment === ExecutionEnvironment.StoreClient }}>
      <AppRoot />
    </ShareIntentProvider>
  );
}

/** Пришла выписка через «Поделиться» — после входа и разблокировки открываем импорт, он загрузит файл сам. */
function SharedStatementRedirect() {
  const { status } = useAuth();
  const { shareIntent } = useShareIntentContext();
  const pathname = usePathname();
  const pending = sharedStatement(shareIntent.files) !== null;
  useEffect(() => {
    if (pending && status === "ready" && pathname !== "/import") router.push("/import");
  }, [pending, status, pathname]);
  return null;
}

function AppRoot() {
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
    // Свайпы в ленте (react-native-gesture-handler) работают только внутри GestureHandlerRootView
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerShown: false,
          headerStyle: { backgroundColor: colors.card },
          headerTintColor: colors.link,
          headerTitleStyle: { color: colors.foreground },
          headerBackTitle: "Назад",
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="quick-add" options={{ presentation: "modal", headerShown: true, title: "Новая операция" }} />
        <Stack.Screen name="category-picker" options={{ presentation: "modal", headerShown: true, title: "Категория" }} />
        {MODAL_SCREENS.map(([name, title]) => (
          <Stack.Screen key={name} name={name} options={{ presentation: "modal", headerShown: true, title }} />
        ))}
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
      <SharedStatementRedirect />
    </GestureHandlerRootView>
  );
}
