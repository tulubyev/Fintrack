import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { API_URL, APP_VERSION, FLAVOR } from "@/lib/config";

type ApiState = "checking" | "ok" | "unavailable";

const API_LABEL: Record<ApiState, string> = {
  checking: "проверяем…",
  ok: "доступен",
  unavailable: "нет связи",
};

/** Стартовый экран каркаса (E2.1-T1): версия сборки и связь с API. Вход и вкладки — в T3 и T6. */
export default function Home() {
  const [api, setApi] = useState<ApiState>("checking");

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    fetch(`${API_URL}/api/healthz`, { signal: controller.signal })
      .then((res) => setApi(res.ok ? "ok" : "unavailable"))
      .catch(() => setApi("unavailable"))
      .finally(() => clearTimeout(timer));
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, []);

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>FinTrack</Text>
      <Text style={styles.subtitle}>Личные финансы</Text>
      <View style={styles.meta}>
        <Text style={styles.metaText}>
          Версия {APP_VERSION} · {FLAVOR}
        </Text>
        <Text style={styles.metaText} testID="api-status">
          Сервер: {API_LABEL[api]}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 8 },
  title: { fontSize: 32, fontWeight: "700" },
  subtitle: { fontSize: 16, opacity: 0.7 },
  meta: { marginTop: 32, alignItems: "center", gap: 4 },
  metaText: { fontSize: 13, opacity: 0.6 },
});
