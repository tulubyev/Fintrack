import type { ColorValue } from "react-native";
import { router, Tabs } from "expo-router";
import { Icon, PRIMARY, useColors, type IconName } from "@/ui/kit";

const icon = (name: IconName) => ({ color, size }: { color: ColorValue; size: number }) => <Icon name={name} size={size} color={String(color)} />;

/** Вкладки (E2.1-T6): Главная · Операции · ＋ · Бюджеты · Ещё. «＋» не вкладка, а быстрый ввод поверх экрана. */
export default function TabsLayout() {
  const colors = useColors();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        // подпись активной вкладки — текст: в тёмной теме PRIMARY для текста слишком тёмный (E1.8-T8)
        tabBarActiveTintColor: colors.link,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Главная", tabBarIcon: icon("home-outline") }} />
      <Tabs.Screen name="transactions" options={{ title: "Операции", tabBarIcon: icon("list-outline") }} />
      <Tabs.Screen
        name="add"
        options={{
          title: "Добавить",
          tabBarIcon: ({ size }) => <Icon name="add-circle" size={size + 10} color={PRIMARY} />,
          tabBarButtonTestID: "tab-add",
        }}
        listeners={{
          tabPress: (event) => {
            event.preventDefault();
            router.push("/quick-add");
          },
        }}
      />
      <Tabs.Screen name="budgets" options={{ title: "Бюджеты", tabBarIcon: icon("pie-chart-outline") }} />
      <Tabs.Screen name="more" options={{ title: "Ещё", tabBarIcon: icon("menu-outline") }} />
    </Tabs>
  );
}
