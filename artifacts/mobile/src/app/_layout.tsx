import { useEffect } from "react";
// только нужные начертания: импорт из корня пакета тянет в бандл все девять
import { Onest_400Regular } from "@expo-google-fonts/onest/400Regular";
import { Onest_500Medium } from "@expo-google-fonts/onest/500Medium";
import { Onest_600SemiBold } from "@expo-google-fonts/onest/600SemiBold";
import { Onest_700Bold } from "@expo-google-fonts/onest/700Bold";
import { useFonts } from "expo-font";
import { AppState, StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { router, Stack, usePathname } from "expo-router";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { ShareIntentProvider, useShareIntentContext } from "expo-share-intent";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { auth } from "@/auth/device";
import { startDataSync } from "@/data/device";
import { startPushRegistration } from "@/push/device";
import { LockScreen } from "@/auth/LockScreen";
import { LoginScreen } from "@/auth/LoginScreen";
import { PinSetupScreen } from "@/auth/PinSetupScreen";
import { useAuth } from "@/auth/useAuth";
import { sharedStatement } from "@/lib/imports";
import { ThemeProvider, useColors } from "@/ui/kit";

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

// Сплэш со знаком «Грань» держим, пока не загрузится шрифт Onest (фирменный стиль, #172)
void SplashScreen.preventAutoHideAsync().catch(() => undefined);

/**
 * Вход поверх навигации (E2.1-T3): без сессии — экран входа, после входа — PIN,
 * блокировка закрывает приложение целиком, не сбрасывая открытый экран.
 * Навигатор монтируется сразу после загрузки шрифтов и дальше не размонтируется — так expo-router принимает deep link и до входа.
 */
export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ Onest_400Regular, Onest_500Medium, Onest_600SemiBold, Onest_700Bold });
  // шрифт не загрузился — не держим пользователя на сплэше: текст покажется системным шрифтом
  const ready = fontsLoaded || fontError !== null;
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync().catch(() => undefined);
  }, [ready]);
  if (!ready) return null;

  return (
    // «Поделиться» выпиской из банковского приложения (E2.1-T9); в Expo Go нативного модуля нет
    <ShareIntentProvider options={{ disabled: Constants.executionEnvironment === ExecutionEnvironment.StoreClient }}>
      {/* тема из настроек: светлая, тёмная, кремовая или как в системе */}
      <ThemeProvider>
        <AppRoot />
      </ThemeProvider>
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
    const stopPush = startPushRegistration();
    return () => {
      subscription.remove();
      stopSync();
      stopPush();
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
