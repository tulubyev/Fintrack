import { useRef, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import ReanimatedSwipeable, { type SwipeableMethods } from "react-native-gesture-handler/ReanimatedSwipeable";
import * as Haptics from "expo-haptics";
import { family, Icon, PRIMARY, useColors, type IconName } from "./kit";

export interface SwipeAction {
  label: string;
  icon: IconName;
  tone: "primary" | "danger";
  onPress: () => void;
  testID?: string;
}

/**
 * Строка со свайпом (E2.1-T7): вправо — действие слева (например, «Категория»), влево — справа («Удалить»).
 * Действие срабатывает по нажатию на открывшуюся кнопку, строка закрывается.
 */
export function SwipeRow({ children, left, right }: { children: ReactNode; left?: SwipeAction; right?: SwipeAction }) {
  const colors = useColors();
  const ref = useRef<SwipeableMethods>(null);
  const action = (item: SwipeAction) => (
    <Pressable
      onPress={() => {
        ref.current?.close();
        item.onPress();
      }}
      testID={item.testID}
      style={[styles.action, { backgroundColor: item.tone === "danger" ? colors.danger : PRIMARY }]}
    >
      <Icon name={item.icon} size={20} color="#fff" />
      <Text style={styles.label}>{item.label}</Text>
    </Pressable>
  );
  return (
    <ReanimatedSwipeable
      ref={ref}
      friction={2}
      overshootLeft={false}
      overshootRight={false}
      renderLeftActions={left ? () => action(left) : undefined}
      renderRightActions={right ? () => action(right) : undefined}
      onSwipeableWillOpen={() => void Haptics.selectionAsync()}
    >
      {/* обёртка: типы gesture-handler собраны с @types/react 18, а ReactNode из React 19 шире */}
      <View>{children}</View>
    </ReanimatedSwipeable>
  );
}

const styles = StyleSheet.create({
  action: { width: 96, alignItems: "center", justifyContent: "center", gap: 4 },
  label: { color: "#fff", fontSize: 12, fontFamily: family.semibold },
});
