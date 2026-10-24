import { useEffect, useRef, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import { useShareIntentContext } from "expo-share-intent";
import { errorMessage } from "@workspace/shared/api";
import { formatDate } from "@workspace/shared/money";
import { useAuth } from "@/auth/useAuth";
import { recentImports, uploadStatement } from "@/data/imports";
import { sharedStatement, type ImportBatch, type PickedFile } from "@/lib/imports";
import { Button, Card, EmptyState, Hint, Label, ListItem, Page, Section } from "@/ui/kit";

const STATUS: Record<string, string> = {
  uploaded: "Загружена", parsing: "Читаем…", needs_mapping: "Нужно выбрать колонки", preview: "Ждёт подтверждения",
  committing: "Сохраняем…", done: "Загружена", failed: "Ошибка", cancelled: "Удалена", undone: "Отменена",
};

/**
 * Импорт выписки (E2.1-T9): файл из «Поделиться» (банковское приложение → FinTrack) загружается сам, иначе — выбор файла.
 * Дальше тот же мастер, что на сайте: /import/:id. Со страницы счёта (?accountId=) счёт выбран заранее.
 */
export default function ImportStart() {
  const { accountId } = useLocalSearchParams<{ accountId?: string }>();
  const { status } = useAuth();
  const { shareIntent, resetShareIntent } = useShareIntentContext();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<ImportBatch[] | null>(null);
  const sharedTaken = useRef(false);

  const upload = async (file: PickedFile) => {
    setBusy(true);
    setError(null);
    try {
      const batch = await uploadStatement(file, { accountId });
      router.replace(`/import/${batch.id}`);
    } catch (problem) {
      setError(errorMessage(problem));
    } finally {
      setBusy(false);
    }
  };

  // файл из «Поделиться» — один раз, после входа и разблокировки
  const shared = sharedStatement(shareIntent.files);
  useEffect(() => {
    if (!shared) {
      sharedTaken.current = false; // следующий «Поделиться» на этом же экране тоже загрузится
      return;
    }
    if (status !== "ready" || sharedTaken.current) return;
    sharedTaken.current = true;
    resetShareIntent();
    void upload(shared);
  }, [shared, status]);

  useEffect(() => {
    recentImports().then((page) => setRecent(page.items)).catch(() => setRecent([]));
  }, []);

  const pick = async () => {
    // тип не ограничиваем: CSV на Android приходит с разными типами; сервер проверит файл по содержимому
    const result = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: true, multiple: false });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    await upload({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType });
  };

  return (
    <Page header={false}>
      <EmptyState
        icon="document-attach-outline"
        title="Загрузите выписку из банка"
        text="Операции за 3–12 месяцев — без дублей и с категориями. Подходят CSV и Excel; PDF Сбера научимся читать позже."
        action={<Button title="Выбрать файл" icon="folder-open-outline" busy={busy} onPress={() => void pick()} testID="import-pick" />}
      />
      {error && <Hint tone="danger">{error}</Hint>}
      <Card>
        <Label variant="caption" tone="muted">Из приложения банка</Label>
        <Label>Скачайте выписку, нажмите «Поделиться» и выберите FinTrack — файл загрузится сам.</Label>
      </Card>
      {recent && recent.length > 0 && (
        <Section title="Последние загрузки">
          {recent.map((batch) => (
            <ListItem
              key={batch.id}
              icon="document-text-outline"
              title={batch.fileName}
              subtitle={`${formatDate(batch.createdAt.slice(0, 10))} · ${STATUS[batch.status] ?? batch.status}`}
              onPress={() => router.push(`/import/${batch.id}`)}
            />
          ))}
        </Section>
      )}
    </Page>
  );
}
