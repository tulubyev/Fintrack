import type { Series } from "@/data/types";

const PER_MONTH: Record<string, number> = { weekly: 52 / 12, biweekly: 26 / 12, monthly: 1, quarterly: 1 / 3, yearly: 1 / 12 };
export const PERIOD_LABEL: Record<string, string> = { weekly: "раз в неделю", biweekly: "раз в 2 недели", monthly: "раз в месяц", quarterly: "раз в квартал", yearly: "раз в год" };

/** Сколько регулярные списания стоят в месяц: сумма × частота (раз в год — 1/12). Только рубли и только списания. */
export function monthlyCost(series: Series[]): number {
  return series
    .filter((item) => item.direction === "out" && item.currency === "RUB")
    .reduce((sum, item) => sum + Number(item.expectedAmount ?? item.amountLast ?? 0) * (PER_MONTH[item.periodicity ?? ""] ?? 0), 0);
}
