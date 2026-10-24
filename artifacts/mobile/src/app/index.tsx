import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { api, auth } from "@/auth/device";
import { useAuth } from "@/auth/useAuth";
import { APP_VERSION, FLAVOR } from "@/lib/config";
import { Button, Screen, Title, useColors } from "@/ui/kit";

type ApiState = "checking" | "ok" | "unavailable";

const API_LABEL: Record<ApiState, string> = {
  checking: "проверяем…",
  ok: "доступен",
  unavailable: "нет связи",
};

/** Временная главная после входа: приветствие, связь с API, выход. Настоящая главная — T7. */
export default function Home() {
  const { user } = useAuth();
  const colors = useColors();
  const [status, setStatus] = useState<ApiState>("checking");

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    api<{ status: string }>("/api/healthz", { signal: controller.signal })
      .then((health) => mounted && setStatus(health.status === "ok" ? "ok" : "unavailable"))
      .catch(() => mounted && setStatus("unavailable"))
      .finally(() => clearTimeout(timer));
    return () => {
      mounted = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, []);

  return (
    <Screen>
      <Title>{user?.firstName ? `Здравствуйте, ${user.firstName}!` : "FinTrack"}</Title>
      <View style={styles.meta}>
        <Text style={[styles.metaText, { color: colors.muted }]}>
          Версия {APP_VERSION} · {FLAVOR}
        </Text>
        <Text style={[styles.metaText, { color: colors.muted }]} testID="api-status">
          Сервер: {API_LABEL[status]}
        </Text>
      </View>
      <Button title="Выйти" variant="link" onPress={() => void auth.logout()} testID="logout" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  meta: { gap: 4 },
  metaText: { fontSize: 13 },
});
