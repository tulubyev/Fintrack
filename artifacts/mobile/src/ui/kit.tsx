import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, useColorScheme, View, type TextInputProps } from "react-native";

/**
 * Минимальный набор для экранов входа (T3). Цвета — из темы веба (index.css);
 * полноценный UI-кит появится в T6.
 */
const palette = {
  light: { background: "hsl(210, 40%, 98%)", foreground: "hsl(210, 40%, 8%)", muted: "hsl(210, 15%, 45%)", border: "hsl(210, 20%, 85%)", card: "#ffffff", danger: "hsl(0, 72%, 45%)" },
  dark: { background: "hsl(210, 40%, 8%)", foreground: "hsl(210, 40%, 95%)", muted: "hsl(210, 15%, 65%)", border: "hsl(210, 20%, 22%)", card: "hsl(210, 35%, 12%)", danger: "hsl(0, 72%, 62%)" },
};
export const PRIMARY = "hsl(210, 100%, 50%)";

export function useColors() {
  return palette[useColorScheme() === "dark" ? "dark" : "light"];
}

export function Screen({ children }: { children: ReactNode }) {
  const colors = useColors();
  return <View style={[styles.screen, { backgroundColor: colors.background }]}>{children}</View>;
}

export function Title({ children }: { children: ReactNode }) {
  return <Text style={[styles.title, { color: useColors().foreground }]}>{children}</Text>;
}

export function Hint({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "danger" }) {
  const colors = useColors();
  return <Text style={[styles.hint, { color: tone === "danger" ? colors.danger : colors.muted }]}>{children}</Text>;
}

export function Field(props: TextInputProps & { label: string }) {
  const colors = useColors();
  const { label, style, ...input } = props;
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.muted }]}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.muted}
        style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }, style]}
        {...input}
      />
    </View>
  );
}

export function Button({ title, onPress, disabled, busy, variant = "primary", testID }: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  variant?: "primary" | "link";
  testID?: string;
}) {
  const colors = useColors();
  const inactive = disabled || busy;
  if (variant === "link") {
    return (
      <Pressable onPress={onPress} disabled={inactive} hitSlop={12} testID={testID} accessibilityRole="button">
        <Text style={[styles.link, { color: inactive ? colors.muted : PRIMARY }]}>{title}</Text>
      </Pressable>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      testID={testID}
      accessibilityRole="button"
      style={({ pressed }) => [styles.button, { opacity: inactive ? 0.5 : pressed ? 0.85 : 1 }]}
    >
      {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{title}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 24, justifyContent: "center", gap: 16 },
  title: { fontSize: 26, fontWeight: "700" },
  hint: { fontSize: 14, lineHeight: 20 },
  field: { gap: 6 },
  label: { fontSize: 13 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  button: { alignSelf: "stretch", backgroundColor: PRIMARY, borderRadius: 12, paddingVertical: 14, alignItems: "center", minHeight: 48, justifyContent: "center" },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  link: { fontSize: 15, textAlign: "center", paddingVertical: 8 },
});
