import { router, type Href } from "expo-router";
import { useSyncState } from "@/data/hooks";
import { Badge, ListItem, Page, Section, type IconName } from "@/ui/kit";

interface Item {
  title: string;
  icon: IconName;
  href?: Href;
  /** Эпик, в котором раздел появится. */
  soon?: string;
}

const FINANCE: Item[] = [
  { title: "Счета", icon: "card-outline", href: "/accounts" },
  { title: "Цели", icon: "flag-outline", href: "/goals" },
  { title: "Подписки и регулярные платежи", icon: "repeat-outline", href: "/subscriptions" },
  { title: "Категории", icon: "pricetags-outline", href: "/categories" },
  { title: "Правила категорий", icon: "git-branch-outline", href: "/categories/rules" },
  { title: "Импорт выписки", icon: "document-attach-outline", href: "/import" },
];

const SOON: Item[] = [
  { title: "Советник", icon: "chatbubbles-outline", soon: "E2.4" },
  { title: "Кешбэк", icon: "gift-outline", soon: "E2.5" },
  { title: "Налоговые вычеты", icon: "receipt-outline", soon: "E2.6" },
  { title: "Безопасность", icon: "shield-checkmark-outline", soon: "E2.7" },
  { title: "Подписка FinTrack", icon: "star-outline", soon: "E2.8" },
];

/** «Ещё» (E2.1-T6): разделы, которым не хватило вкладки; будущие — с пометкой «скоро». */
export default function More() {
  const sync = useSyncState();
  const issues = sync.conflicts + sync.failed;
  const row = (item: Item) => (
    <ListItem
      key={item.title}
      icon={item.icon}
      title={item.title}
      disabled={!item.href}
      right={item.soon ? <Badge text="скоро" /> : undefined}
      onPress={item.href ? () => router.push(item.href!) : undefined}
      testID={`more-${item.title}`}
    />
  );

  return (
    <Page title="Ещё">
      <Section title="Финансы">{FINANCE.map(row)}</Section>
      <Section title="Приложение">
        <ListItem icon="settings-outline" title="Настройки" onPress={() => router.push("/settings")} testID="more-settings" />
        <ListItem
          icon="sync-outline"
          title="Синхронизация"
          subtitle={sync.pending ? `В очереди: ${sync.pending}` : undefined}
          right={issues ? <Badge text={`${issues}`} tone="danger" /> : undefined}
          onPress={() => router.push("/sync-issues")}
          testID="more-sync"
        />
      </Section>
      <Section title="Скоро">{SOON.map(row)}</Section>
    </Page>
  );
}
