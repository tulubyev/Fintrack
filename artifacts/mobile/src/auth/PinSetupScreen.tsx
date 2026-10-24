import { useState } from "react";
import { Alert } from "react-native";
import { Button, Hint, Screen, Title } from "@/ui/kit";
import { PinPad } from "@/ui/PinPad";
import { auth } from "./device";
import { isValidPin, PIN_MIN_LENGTH } from "./pin";

/** PIN из 4–6 цифр вводится дважды; после — предложение входить по отпечатку, если он настроен. */
export function PinSetupScreen() {
  const [first, setFirst] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const next = async () => {
    if (first === null) {
      setFirst(value);
      setValue("");
      setError(null);
      return;
    }
    if (value !== first) {
      setFirst(null);
      setValue("");
      setError("PIN-коды не совпали — задайте ещё раз");
      return;
    }
    setBusy(true);
    await auth.setPin(value);
    if (await auth.biometricsAvailable()) {
      Alert.alert("Входить по отпечатку?", "PIN-код останется запасным способом.", [
        { text: "Не сейчас", style: "cancel" },
        { text: "Включить", onPress: () => void auth.setBiometrics(true) },
      ]);
    }
  };

  return (
    <Screen>
      <Title>{first === null ? "Придумайте PIN-код" : "Повторите PIN-код"}</Title>
      <Hint>{`От ${PIN_MIN_LENGTH} до 6 цифр. Им вы будете открывать приложение вместо пароля.`}</Hint>
      {error && <Hint tone="danger">{error}</Hint>}
      <PinPad value={value} onChange={setValue} disabled={busy} />
      <Button title={first === null ? "Далее" : "Готово"} onPress={next} disabled={!isValidPin(value)} busy={busy} testID="pin-setup-next" />
    </Screen>
  );
}
