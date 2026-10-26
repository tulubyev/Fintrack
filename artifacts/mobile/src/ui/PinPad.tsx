import { Pressable, StyleSheet, Text, View } from "react-native";
import { PIN_MAX_LENGTH } from "@/auth/pin";
import { family, useColors } from "./kit";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

/** Точки введённых цифр и крупная цифровая клавиатура; слева внизу — необязательное действие (отпечаток). */
export function PinPad({ value, onChange, extraKey, disabled }: {
  value: string;
  onChange: (next: string) => void;
  extraKey?: { label: string; onPress: () => void };
  disabled?: boolean;
}) {
  const colors = useColors();
  const press = (digit: string) => !disabled && value.length < PIN_MAX_LENGTH && onChange(value + digit);
  const key = (label: string, onPress: () => void, testID: string, a11y?: string) => (
    <Pressable
      key={testID}
      onPress={onPress}
      disabled={disabled}
      testID={testID}
      accessibilityLabel={a11y ?? label}
      style={({ pressed }) => [styles.key, { backgroundColor: pressed ? colors.border : "transparent" }]}
    >
      <Text style={[styles.keyText, { color: colors.foreground }]}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={styles.wrap}>
      <View style={styles.dots} accessibilityLabel={`Введено цифр: ${value.length}`}>
        {Array.from({ length: PIN_MAX_LENGTH }, (_, i) => (
          <View key={i} style={[styles.dot, { borderColor: i < value.length ? colors.primarySolid : colors.border, backgroundColor: i < value.length ? colors.primarySolid : "transparent" }]} />
        ))}
      </View>
      <View style={styles.grid}>
        {KEYS.map((digit) => key(digit, () => press(digit), `pin-key-${digit}`))}
        {extraKey ? key(extraKey.label, extraKey.onPress, "pin-key-extra") : <View style={styles.key} />}
        {key("0", () => press("0"), "pin-key-0")}
        {key("⌫", () => onChange(value.slice(0, -1)), "pin-key-back", "Стереть")}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", gap: 28 },
  dots: { flexDirection: "row", gap: 14 },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2 },
  grid: { flexDirection: "row", flexWrap: "wrap", width: 3 * 84, justifyContent: "center" },
  key: { width: 76, height: 64, margin: 4, borderRadius: 32, alignItems: "center", justifyContent: "center" },
  keyText: { fontSize: 26, fontFamily: family.medium },
});
