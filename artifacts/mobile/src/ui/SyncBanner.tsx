import { Pressable, StyleSheet, Text } from "react-native";
import { router } from "expo-router";
import { useSyncState } from "@/data/hooks";
import { describeSync } from "@/data/sync";
import { useColors } from "./kit";

/** «Нет сети · изменения отправятся позже · 3 в очереди»; при конфликтах и ошибках ведёт на экран решения. */
export function SyncBanner() {
  const state = useSyncState();
  const colors = useColors();
  const banner = describeSync(state);
  if (!banner) return null;
  return (
    <Pressable
      testID="sync-banner"
      disabled={!banner.actionable}
      onPress={() => router.push("/sync-issues")}
      style={[styles.banner, { borderColor: banner.tone === "danger" ? colors.danger : colors.border, backgroundColor: colors.card }]}
    >
      <Text style={[styles.text, { color: banner.tone === "danger" ? colors.danger : colors.muted }]}>
        {banner.text}
        {banner.actionable ? " ›" : ""}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  text: { fontSize: 13 },
});
