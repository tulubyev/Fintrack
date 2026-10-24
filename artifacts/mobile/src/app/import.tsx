import { EmptyState, Page } from "@/ui/kit";

/** Импорт выписки — T9: выбор файла и приём через «Поделиться», мастер импорта. */
export default function Import() {
  return (
    <Page header={false}>
      <EmptyState
        icon="document-attach-outline"
        title="Импорт выписки появится в следующей версии"
        text="Пока загрузите выписку на сайте fin-wall.ru — операции придут в приложение после синхронизации."
      />
    </Page>
  );
}
