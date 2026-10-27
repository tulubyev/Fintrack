import { useEffect, useState } from "react";
import { ApiRequestError, errorMessage } from "@workspace/shared/api";
import { Linking, StyleSheet, View } from "react-native";
import { auth } from "@/auth/device";
import { useAuth } from "@/auth/useAuth";
import { sync } from "@/data/device";
import { useSyncState } from "@/data/hooks";
import { APP_VERSION, FLAVOR, LEGAL_LINKS } from "@/lib/config";
import { Button, Chip, Field, Hint, Label, ListItem, Page, Section, Sheet, THEME_OPTIONS, Toggle, useThemePref } from "@/ui/kit";

/** Настройки (каркас T6): оформление, вход по биометрии (если разрешён, D20), синхронизация, версия, выход и удаление аккаунта. */
export default function Settings() {
  const { user, biometricsAllowed, biometricsEnabled } = useAuth();
  const syncState = useSyncState();
  const theme = useThemePref();
  const [biometricsAvailable, setBiometricsAvailable] = useState(false);
  useEffect(() => {
    void auth.biometricsAvailable().then(setBiometricsAvailable);
  }, [biometricsAllowed]);

  const lastSync = syncState.lastSyncAt
    ? new Date(syncState.lastSyncAt).toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })
    : "ещё не было";

  return (
    <Page header={false}>
      <Section title="Профиль">
        <ListItem icon="person-outline" title={[user?.firstName, user?.lastName].filter(Boolean).join(" ") || "Пользователь"} subtitle="Профиль и пароль — на сайте" />
      </Section>
      <Section title="Оформление">
        <View style={styles.chips}>
          {THEME_OPTIONS.map((option) => (
            <Chip
              key={option.value}
              label={option.label}
              selected={theme.pref === option.value}
              onPress={() => theme.setPref(option.value)}
              testID={`settings-theme-${option.value}`}
            />
          ))}
        </View>
      </Section>
      <Section title="Вход">
        {biometricsAllowed && biometricsAvailable ? (
          <ListItem
            icon="finger-print-outline"
            title="Вход по биометрии"
            right={<Toggle value={biometricsEnabled} onValueChange={(value) => void auth.setBiometrics(value)} testID="settings-biometrics" />}
          />
        ) : (
          <ListItem icon="keypad-outline" title="Вход по PIN-коду" subtitle="Блокировка после 5 минут в фоне" />
        )}
      </Section>
      <Section title="Данные">
        <ListItem
          icon="sync-outline"
          title="Синхронизировать сейчас"
          subtitle={`Последняя: ${lastSync}${syncState.pending ? ` · в очереди ${syncState.pending}` : ""}`}
          onPress={() => void sync.sync({ now: true })}
          chevron={false}
          testID="settings-sync"
        />
      </Section>
      <Section title="О приложении">
        <ListItem icon="information-circle-outline" title={`FinTrack ${APP_VERSION}`} subtitle={`Сборка: ${FLAVOR}`} />
        {LEGAL_LINKS.map((link) => (
          <ListItem key={link.url} icon="document-text-outline" title={link.title} onPress={() => void Linking.openURL(link.url)} chevron />
        ))}
      </Section>
      <Button title="Выйти" variant="danger" icon="log-out-outline" onPress={() => void auth.logout()} testID="logout" />
      <DeleteAccount />
    </Page>
  );
}

/** Удаление аккаунта (E1.0-T6, 152-ФЗ; Google Play требует его в самом приложении): пароль → DELETE /api/v1/me. */
function DeleteAccount() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const close = () => {
    setOpen(false);
    setPassword("");
    setError(null);
  };
  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await auth.deleteAccount(password);
    } catch (failure) {
      setError(failure instanceof ApiRequestError && failure.status === 403 ? "Неверный пароль" : errorMessage(failure));
      setBusy(false);
    }
  };

  return (
    <>
      <Button title="Удалить аккаунт" variant="secondary" icon="trash-outline" onPress={() => setOpen(true)} testID="delete-account" />
      <Sheet visible={open} onClose={close} title="Удалить аккаунт навсегда?">
        <Label tone="muted">
          Мы сотрём все ваши данные: счета, операции, бюджеты, цели, выписки, документы и настройки — на сервере и в этом телефоне. Восстановить их будет нельзя.
        </Label>
        <Field label="Пароль для подтверждения" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" testID="delete-account-password" />
        {error && <Hint tone="danger">{error}</Hint>}
        <Button title="Удалить навсегда" variant="danger" busy={busy} disabled={!password} onPress={() => void confirm()} testID="delete-account-confirm" />
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, padding: 12 },
});
