import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Button, Card, Label } from "@/ui/kit";
import { acceptReminders, dismissReminders, reminderOffered } from "./device";

/**
 * Запрос уведомлений после первой ценности (E2.2-T4): не при первом запуске, а когда пользователь уже увидел пользу —
 * например, после импорта выписки. Системный запрос — только по «Напомнить»; «Не сейчас» — спросим через две недели.
 */
export function ReminderCard() {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    void reminderOffered().then((offer) => alive && setVisible(offer), () => undefined);
    return () => {
      alive = false;
    };
  }, []);
  if (!visible) return null;

  const accept = async () => {
    setBusy(true);
    await acceptReminders().catch(() => false);
    setVisible(false);
  };
  const dismiss = () => {
    setVisible(false);
    void dismissReminders().catch(() => undefined);
  };
  return (
    <Card testID="push-reminder">
      <Label>Напомнить о списании подписок за день?</Label>
      <Label variant="caption" tone="muted">
        Пришлём уведомление накануне списания и когда бюджет подходит к концу. Ночью не беспокоим.
      </Label>
      <View style={styles.actions}>
        <Button title="Напомнить" busy={busy} onPress={() => void accept()} testID="push-reminder-accept" />
        <Button title="Не сейчас" variant="link" onPress={dismiss} testID="push-reminder-dismiss" />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  actions: { gap: 4, marginTop: 8 },
});
