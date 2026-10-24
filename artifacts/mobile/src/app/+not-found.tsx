import { router } from "expo-router";
import { Button, EmptyState, Page } from "@/ui/kit";

/** Ссылка на экран, которого нет в этой версии приложения. */
export default function NotFound() {
  return (
    <Page>
      <EmptyState
        icon="compass-outline"
        title="Такого экрана нет"
        text="Ссылка ведёт туда, чего нет в этой версии приложения. Возможно, раздел есть на сайте."
        action={<Button title="На главную" onPress={() => router.replace("/")} testID="not-found-home" />}
      />
    </Page>
  );
}
