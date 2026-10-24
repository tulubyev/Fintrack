import { useCallback, useEffect, useState } from "react";
import { Alert, Linking, StyleSheet, Switch, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { errorMessage } from "@workspace/shared/api";
import { formatDate } from "@workspace/shared/money";
import { cancelImport, commitImport, decideRow, getImport, importRows, setMapping, undoImport } from "@/data/imports";
import { store, sync } from "@/data/device";
import { useLocal } from "@/data/hooks";
import type { Account } from "@/data/types";
import { BUSY, describeMapping, importable, plural, toImportCount, type ImportBatch, type ImportRow } from "@/lib/imports";
import { Badge, Button, Card, Chip, EmptyState, Field, Hint, Label, ListItem, Money, Page, PRIMARY, Section } from "@/ui/kit";

const NEW_ACCOUNT = "new";
const PAGE = 50;
const WEB_URL = "https://fin-wall.ru";

/** Мастер одного импорта (E2.1-T9): разбор → подтверждение колонок → счёт и предпросмотр → сохранение → итог и отмена. */
export default function ImportWizard() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [batch, setBatch] = useState<ImportBatch | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => getImport(id).then(setBatch).catch((problem) => setError(errorMessage(problem))), [id]);
  useEffect(() => {
    void load();
  }, [load]);
  // разбор и сохранение идут на сервере — опрашиваем раз в секунду
  useEffect(() => {
    if (!batch || !BUSY.includes(batch.status)) return;
    const timer = setTimeout(() => void load(), 1000);
    return () => clearTimeout(timer);
  }, [batch, load]);
  // сохранили — операции придут синхронизацией
  useEffect(() => {
    if (batch?.status === "done" || batch?.status === "undone") void sync.sync({ now: true });
  }, [batch?.status]);

  if (error) return <Page header={false}><EmptyState icon="alert-circle-outline" title="Импорт не открылся" text={error} /></Page>;
  if (!batch) return <Page header={false}><EmptyState icon="hourglass-outline" title="Загружаем…" /></Page>;

  switch (batch.status) {
    case "uploaded":
    case "parsing":
      return <Page header={false}><EmptyState icon="hourglass-outline" title="Читаем выписку…" text={batch.fileName} /></Page>;
    case "committing":
      return <Page header={false}><EmptyState icon="hourglass-outline" title="Сохраняем операции…" text={batch.fileName} /></Page>;
    case "needs_mapping":
      return <Mapping batch={batch} onChange={setBatch} />;
    case "preview":
      return <Preview batch={batch} onChange={setBatch} />;
    case "done":
      return <Done batch={batch} onChange={setBatch} />;
    default:
      return (
        <Page header={false}>
          <EmptyState
            icon="alert-circle-outline"
            title={batch.status === "failed" ? "Не удалось прочитать выписку" : batch.status === "undone" ? "Импорт отменён" : "Загрузка удалена"}
            text={batch.errorMessage ?? batch.fileName}
            action={<Button title="Выбрать другой файл" onPress={() => router.replace("/import")} />}
          />
        </Page>
      );
  }
}

/** Незнакомый формат: на телефоне — подтвердить подсказку одним нажатием, подробная настройка колонок — на сайте. */
function Mapping({ batch, onChange }: { batch: ImportBatch; onChange: (batch: ImportBatch) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const suggested = batch.suggestedMapping;
  const apply = async () => {
    if (!suggested) return;
    setBusy(true);
    try {
      onChange(await setMapping(batch.id, suggested));
    } catch (problem) {
      setError(errorMessage(problem));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Page header={false}>
      <Card>
        <Label variant="caption" tone="muted">Новый формат выписки</Label>
        {suggested ? (
          <Label>Похоже, что {describeMapping(suggested)}. Распознать так? Мы запомним, и такие файлы будут читаться сами.</Label>
        ) : (
          <Label>Не получилось понять, где дата и сумма. Выберите колонки на сайте — один раз, дальше такие файлы будут читаться сами.</Label>
        )}
      </Card>
      {error && <Hint tone="danger">{error}</Hint>}
      {suggested && <Button title="Распознать" busy={busy} onPress={() => void apply()} testID="import-mapping-apply" />}
      <Button title="Настроить на сайте" variant="secondary" icon="open-outline" onPress={() => void Linking.openURL(`${WEB_URL}/import/${batch.id}`)} />
    </Page>
  );
}

function Preview({ batch, onChange }: { batch: ImportBatch; onChange: (batch: ImportBatch) => void }) {
  const accounts = useLocal(() => store.list<Account>("accounts"), []);
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [shown, setShown] = useState(PAGE);
  const suggested = batch.suggestedAccount;
  const [choice, setChoice] = useState(suggested?.accountId ?? NEW_ACCOUNT);
  const [name, setName] = useState(suggested?.create?.name ?? "Новый счёт");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    importRows(batch.id).then(setRows).catch((problem) => setError(errorMessage(problem)));
  }, [batch.id]);

  const active = (accounts ?? []).filter((account) => !account.archivedAt);
  const count = rows ? toImportCount(rows) : 0;
  const currency = batch.accountCurrency ?? suggested?.create?.currency ?? "RUB";

  const toggle = (row: ImportRow, on: boolean) => {
    const decision = on ? "import" : "skip";
    setRows((current) => current?.map((item) => (item.id === row.id ? { ...item, decision } : item)) ?? null);
    decideRow(batch.id, row.id, decision).catch((problem) => {
      setError(errorMessage(problem));
      setRows((current) => current?.map((item) => (item.id === row.id ? row : item)) ?? null);
    });
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const base = suggested?.create ?? { name, kind: "debit_card" as const, institutionCode: batch.institutionCode, currency, lastFour: batch.cardLast4[0] ?? null };
      onChange(await commitImport(batch.id, choice === NEW_ACCOUNT ? { createAccount: { ...base, name: name.trim() || base.name } } : { accountId: choice }));
    } catch (problem) {
      setError(errorMessage(problem));
    } finally {
      setBusy(false);
    }
  };

  const remove = () =>
    Alert.alert("Удалить загрузку?", "Файл и разобранные строки удалятся, операции не сохранятся.", [
      { text: "Отмена", style: "cancel" },
      { text: "Удалить", style: "destructive", onPress: () => void cancelImport(batch.id).then(() => router.replace("/import")) },
    ]);

  return (
    <Page header={false}>
      <Section title={batch.cardLast4.length ? `Куда сохранить · карта •• ${batch.cardLast4.join(", ")}` : "Куда сохранить"}>
        {active.map((account) => (
          <ListItem
            key={account.id}
            icon={choice === account.id ? "radio-button-on" : "radio-button-off"}
            title={account.name}
            subtitle={`${account.currency}${account.lastFour && !account.name.includes(account.lastFour) ? ` · •• ${account.lastFour}` : ""}`}
            onPress={() => setChoice(account.id)}
            chevron={false}
          />
        ))}
        <ListItem icon={choice === NEW_ACCOUNT ? "radio-button-on" : "radio-button-off"} title="Новый счёт" subtitle={currency} onPress={() => setChoice(NEW_ACCOUNT)} chevron={false} testID="import-new-account" />
      </Section>
      {choice === NEW_ACCOUNT && <Field label="Название счёта" value={name} onChangeText={setName} maxLength={100} />}

      {[...batch.warnings, ...(batch.duplicateOfImportId ? ["Этот файл уже загружали — такие операции отмечены «уже есть»."] : [])].map((warning) => (
        <Hint key={warning}>{warning}</Hint>
      ))}

      <View style={styles.chips}>
        <Chip label={`${batch.stats.new ?? 0} новых`} selected onPress={() => undefined} />
        {(batch.stats.duplicate ?? 0) > 0 && <Chip label={`${batch.stats.duplicate} уже есть`} onPress={() => undefined} />}
        {(batch.stats.skipped ?? 0) > 0 && <Chip label={`${batch.stats.skipped} пропущено`} onPress={() => undefined} />}
      </View>

      <Section>
        {(rows ?? []).slice(0, shown).map((row) => (
          <ListItem
            key={row.id}
            title={row.description}
            subtitle={[formatDate(row.date), row.status === "duplicate" ? "уже есть" : row.errorMessage].filter(Boolean).join(" · ")}
            value={<Money amount={row.amount} currency={row.currency} signed />}
            right={importable(row) ? <Switch value={row.decision === "import"} onValueChange={(on) => toggle(row, on)} trackColor={{ true: PRIMARY }} /> : <Badge text="пропуск" />}
          />
        ))}
      </Section>
      {rows && rows.length > shown && <Button title={`Показать ещё ${Math.min(PAGE, rows.length - shown)}`} variant="link" onPress={() => setShown((value) => value + PAGE)} />}

      {(error ?? batch.errorMessage) && <Hint tone="danger">{error ?? batch.errorMessage}</Hint>}
      <Button
        title={count ? `Импортировать ${count} ${plural(count, "операцию", "операции", "операций")}` : "Нечего импортировать"}
        disabled={!count || !rows}
        busy={busy}
        onPress={() => void save()}
        testID="import-commit"
      />
      <Button title="Удалить загрузку" variant="link" onPress={remove} />
    </Page>
  );
}

function Done({ batch, onChange }: { batch: ImportBatch; onChange: (batch: ImportBatch) => void }) {
  const imported = batch.stats.imported ?? 0;
  const period = batch.periodFrom && batch.periodTo ? ` за ${formatDate(batch.periodFrom)} — ${formatDate(batch.periodTo)}` : "";
  const diff = batch.balanceCheck && batch.balanceCheck.diff !== "0.00" ? batch.balanceCheck : null;
  const undo = () =>
    Alert.alert(
      "Отменить импорт?",
      `${imported} ${plural(imported, "операция", "операции", "операций")} из файла удалятся.${batch.editedCount ? ` Вы уже правили ${batch.editedCount} — правки тоже пропадут.` : ""}`,
      [
        { text: "Не отменять", style: "cancel" },
        { text: "Отменить импорт", style: "destructive", onPress: () => void undoImport(batch.id).then(onChange).catch((problem) => Alert.alert("Не получилось", errorMessage(problem))) },
      ],
    );
  return (
    <Page header={false}>
      <EmptyState
        icon="checkmark-circle-outline"
        title={`Загружено ${imported} ${plural(imported, "операция", "операции", "операций")}${period}`}
        text={(batch.stats.duplicate ?? 0) > 0 ? `Уже были в FinTrack и пропущены: ${batch.stats.duplicate}` : "Операции появятся в ленте после синхронизации."}
        action={<Button title="Посмотреть траты" onPress={() => router.replace("/transactions")} />}
      />
      {diff && <Hint>В выписке остаток другой, чем получился у счёта. Проверьте остаток на странице счёта.</Hint>}
      <Button title="Загрузить ещё выписку" variant="secondary" onPress={() => router.replace("/import")} />
      {batch.committedAt && Date.now() - Date.parse(batch.committedAt) < 30 * 86_400_000 && <Button title="Отменить импорт" variant="link" onPress={undo} />}
    </Page>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
