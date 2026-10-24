import type { IconName } from "@/ui/kit";

/** Виды счетов (ACCOUNT_KINDS в схеме БД), которые предлагает приложение, с подписями и иконками. */
export const ACCOUNT_KINDS: { value: string; label: string; icon: IconName }[] = [
  { value: "debit_card", label: "Карта", icon: "card-outline" },
  { value: "cash", label: "Наличные", icon: "cash-outline" },
  { value: "credit_card", label: "Кредитка", icon: "card" },
  { value: "savings", label: "Накопительный", icon: "wallet-outline" },
  { value: "deposit", label: "Вклад", icon: "lock-closed-outline" },
  { value: "current", label: "Текущий", icon: "business-outline" },
  { value: "brokerage", label: "Брокерский", icon: "trending-up-outline" },
  { value: "other", label: "Другой", icon: "ellipse-outline" },
];
export const kindIcon = (kind: string): IconName => ACCOUNT_KINDS.find((item) => item.value === kind)?.icon ?? "wallet-outline";
