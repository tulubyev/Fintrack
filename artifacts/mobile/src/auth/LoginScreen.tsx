import { useState } from "react";
import { KeyboardAvoidingView, Linking, Platform } from "react-native";
import { errorMessage } from "@workspace/shared/api";
import { LEGAL_LINKS } from "@/lib/config";
import { Button, Field, Hint, Label, Screen, Title } from "@/ui/kit";
import { auth } from "./device";
import { useAuth } from "./useAuth";

/** Вход по телефону или e-mail и паролю, при включённой 2FA — второй шаг с кодом. */
export function LoginScreen() {
  const { notice } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [needsCode, setNeedsCode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await auth.login(identifier, password, needsCode ? code : undefined);
      if (result === "twoFactor") setNeedsCode(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const ready = identifier.trim() !== "" && password !== "" && (!needsCode || code.length === 6);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen>
        <Title>Вход в FinTrack</Title>
        <Label tone="muted">Умный финансовый агрегатор</Label>
        {notice && <Hint tone="danger">{notice}</Hint>}
        <Field
          label="Телефон или e-mail"
          value={identifier}
          onChangeText={setIdentifier}
          autoCapitalize="none"
          autoComplete="username"
          keyboardType="email-address"
          editable={!needsCode}
          testID="login-identifier"
        />
        <Field
          label="Пароль"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="current-password"
          editable={!needsCode}
          testID="login-password"
        />
        {needsCode && (
          <Field
            label="Код двухфакторной аутентификации"
            value={code}
            onChangeText={(text) => setCode(text.replace(/\D/g, "").slice(0, 6))}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            autoFocus
            testID="login-2fa"
          />
        )}
        {error && <Hint tone="danger">{error}</Hint>}
        <Button title={needsCode ? "Подтвердить" : "Войти"} onPress={submit} disabled={!ready} busy={busy} testID="login-submit" />
        <Hint>Нет аккаунта или забыли пароль? Зарегистрироваться и восстановить пароль можно на fin-wall.ru.</Hint>
        {LEGAL_LINKS.map((link) => (
          <Button key={link.url} title={link.title} variant="link" onPress={() => void Linking.openURL(link.url)} />
        ))}
      </Screen>
    </KeyboardAvoidingView>
  );
}
