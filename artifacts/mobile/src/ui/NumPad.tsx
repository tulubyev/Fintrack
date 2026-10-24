import { Pressable, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import type { AmountKey } from "@/lib/amountInput";
import { Icon, useColors } from "./kit";

const ROWS: AmountKey[][] = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  [",", "0", "back"],
];

/** Крупная цифровая клавиатура быстрого ввода: без системной клавиатуры, с лёгким откликом на нажатие. */
export function NumPad({ onKey }: { onKey: (key: AmountKey) => void }) {
  const colors = useColors();
  return (
    <View style={styles.pad}>
      {ROWS.map((row, index) => (
        <View key={index} style={styles.row}>
          {row.map((key) => (
            <Pressable
              key={key}
              onPress={() => {
                void Haptics.selectionAsync();
                onKey(key);
              }}
              accessibilityLabel={key === "back" ? "Стереть" : key === "," ? "Запятая" : key}
              testID={`numpad-${key === "," ? "comma" : key}`}
              style={({ pressed }) => [styles.key, { backgroundColor: pressed ? colors.border : colors.subtle }]}
            >
              {key === "back" ? <Icon name="backspace-outline" size={26} /> : <Text style={[styles.text, { color: colors.foreground }]}>{key}</Text>}
            </Pressable>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { gap: 8 },
  row: { flexDirection: "row", gap: 8 },
  key: { flex: 1, height: 56, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  text: { fontSize: 26, fontWeight: "500" },
});
