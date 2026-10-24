import { useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { todayIso } from "@workspace/shared/money";
import { dayTitle, yesterdayIso } from "@/lib/dates";
import { Button, Chip, Label, Sheet } from "./kit";

// YYYY-MM-DD ↔ Date в полдень по местному времени: смена часового пояса не сдвинет день
const toDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
};
const toIso = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

/** Дата операции: «Сегодня», «Вчера» или выбор в календаре (будущие даты недоступны). */
export function DateField({ value, onChange, label = "Дата" }: { value: string; onChange: (date: string) => void; label?: string }) {
  const [sheet, setSheet] = useState(false);
  const [draft, setDraft] = useState(value);
  const today = todayIso();
  const yesterday = yesterdayIso();
  const custom = value !== today && value !== yesterday;

  const openCalendar = () => {
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: toDate(value),
        mode: "date",
        maximumDate: toDate(today),
        onChange: (event, date) => {
          if (event.type === "set" && date) onChange(toIso(date));
        },
      });
    } else {
      setDraft(value);
      setSheet(true);
    }
  };

  return (
    <View style={styles.field}>
      <Label variant="caption" tone="muted">{label}</Label>
      <View style={styles.chips}>
        <Chip label="Сегодня" selected={value === today} onPress={() => onChange(today)} testID="date-today" />
        <Chip label="Вчера" selected={value === yesterday} onPress={() => onChange(yesterday)} testID="date-yesterday" />
        <Chip label={custom ? dayTitle(value) : "Другая дата…"} selected={custom} onPress={openCalendar} testID="date-pick" />
      </View>
      {Platform.OS !== "android" && (
        <Sheet visible={sheet} onClose={() => setSheet(false)} title="Дата операции">
          <DateTimePicker
            value={toDate(draft)}
            mode="date"
            display="inline"
            locale="ru-RU"
            maximumDate={toDate(today)}
            onChange={(_, date) => date && setDraft(toIso(date))}
          />
          <Button title="Готово" onPress={() => { onChange(draft); setSheet(false); }} />
        </Sheet>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 6 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
