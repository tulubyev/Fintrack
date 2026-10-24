import { useEffect, useState } from "react";
import { parseMoneyInput } from "@workspace/shared/money";
import { Button, Field, Hint, Sheet } from "./kit";

/**
 * Лист «введите сумму»: лимит бюджета, фактический остаток счёта, взнос в цель. allowNegative — для снятия с цели
 * и отрицательного остатка (кредитка). onSubmit получает сумму в формате API («1234.50») и заметку.
 */
export function AmountSheet({ visible, title, label, initial = "", allowNegative = false, withNote = false, hint, submitTitle = "Сохранить", onClose, onSubmit }: {
  visible: boolean;
  title: string;
  label: string;
  initial?: string;
  allowNegative?: boolean;
  withNote?: boolean;
  hint?: string;
  submitTitle?: string;
  onClose: () => void;
  onSubmit: (amount: string, note: string | null) => void | Promise<void>;
}) {
  const [value, setValue] = useState(initial);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (visible) {
      setValue(initial);
      setNote("");
      setError(null);
    }
  }, [visible, initial]);

  const submit = async () => {
    const amount = parseMoneyInput(value, { allowNegative });
    if (!amount || amount === "0.00" || amount === "-0.00") return setError("Введите сумму");
    await onSubmit(amount, note.trim() || null);
    onClose();
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      <Field label={label} value={value} onChangeText={setValue} keyboardType={allowNegative ? "numbers-and-punctuation" : "decimal-pad"} autoFocus testID="amount-sheet-input" />
      {withNote && <Field label="Заметка" value={note} onChangeText={setNote} testID="amount-sheet-note" />}
      {hint && <Hint>{hint}</Hint>}
      {error && <Hint tone="danger">{error}</Hint>}
      <Button title={submitTitle} onPress={() => void submit()} testID="amount-sheet-save" />
    </Sheet>
  );
}
