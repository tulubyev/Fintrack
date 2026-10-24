import { useEffect, useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { Button, Hint, Title, useColors } from "@/ui/kit";
import { PinPad } from "@/ui/PinPad";
import { MAX_PIN_ATTEMPTS } from "./controller";
import { auth } from "./device";
import { isValidPin, PIN_MAX_LENGTH } from "./pin";
import { useAuth } from "./useAuth";

/** Блокировка поверх приложения: PIN или отпечаток. «Забыли PIN?» — выход и вход с паролем. */
export function LockScreen() {
  const { user, biometricsEnabled, attemptsLeft } = useAuth();
  const colors = useColors();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [wrong, setWrong] = useState(false);

  useEffect(() => {
    if (biometricsEnabled) void auth.unlockWithBiometrics();
  }, [biometricsEnabled]);

  const submit = async (pin: string) => {
    setBusy(true);
    const ok = await auth.unlockWithPin(pin);
    setBusy(false);
    setValue("");
    setWrong(!ok);
  };

  const change = (next: string) => {
    setValue(next);
    setWrong(false);
    if (next.length === PIN_MAX_LENGTH) void submit(next);
  };

  const forgot = () =>
    Alert.alert("Забыли PIN-код?", "Выйдем из аккаунта на этом устройстве — войдите с паролем и задайте новый PIN.", [
      { text: "Отмена", style: "cancel" },
      { text: "Выйти", style: "destructive", onPress: () => void auth.logout() },
    ]);

  return (
    <View style={[StyleSheet.absoluteFill, styles.overlay, { backgroundColor: colors.background }]} testID="lock-screen">
      <Title>{user?.firstName ? `${user.firstName}, введите PIN` : "Введите PIN"}</Title>
      {wrong && (
        <Hint tone="danger">
          {attemptsLeft < MAX_PIN_ATTEMPTS ? `Неверный PIN. Осталось попыток: ${attemptsLeft}` : "Неверный PIN"}
        </Hint>
      )}
      <PinPad
        value={value}
        onChange={change}
        disabled={busy}
        extraKey={biometricsEnabled ? { label: "☝", onPress: () => void auth.unlockWithBiometrics() } : undefined}
      />
      {value.length < PIN_MAX_LENGTH && (
        <Button title="Открыть" onPress={() => submit(value)} disabled={!isValidPin(value)} busy={busy} testID="lock-submit" />
      )}
      <Button title="Забыли PIN?" variant="link" onPress={forgot} />
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { padding: 24, justifyContent: "center", alignItems: "center", gap: 16 },
});
