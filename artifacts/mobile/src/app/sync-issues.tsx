import { StyleSheet, Text, View } from "react-native";
import { store } from "@/data/device";
import { useLocal } from "@/data/hooks";
import type { OutboxItem } from "@/data/store";
import { Button, EmptyState, Hint, Page, useColors } from "@/ui/kit";

const ENTITY_LABEL: Record<string, string> = {
  accounts: "Счёт", categories: "Категория", transactions: "Операция", budgets: "Бюджет", goals: "Цель",
  goalContributions: "Взнос в цель", recurring: "Регулярный платёж", rules: "Правило категории",
};

const FIELD_LABEL: Record<string, string> = {
  amount: "сумма", date: "дата", time: "время", merchant: "получатель", note: "заметка", categoryId: "категория",
  accountId: "счёт", type: "тип", excludeFromStats: "учёт в статистике", name: "название",
};

const show = (value: unknown) => (value === null || value === undefined || value === "" ? "—" : String(value));

/** Конфликты и отклонённые правки: «оставить мою / взять с сервера», «повторить / отменить». */
export default function SyncIssues() {
  const issues = useLocal(() => store.issues(), []);

  return (
    <Page header={false}>
      {issues?.length === 0 && <EmptyState icon="checkmark-circle-outline" title="Всё отправлено" text="Решать нечего." />}
      {issues?.map((issue) => <IssueCard key={issue.seq} issue={issue} />)}
    </Page>
  );
}

function IssueCard({ issue }: { issue: OutboxItem }) {
  const colors = useColors();
  const title = `${ENTITY_LABEL[issue.entity] ?? issue.entity}${issue.patch?.merchant ? ` «${issue.patch.merchant}»` : ""}`;
  return (
    <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]} testID={`issue-${issue.seq}`}>
      <Text style={[styles.cardTitle, { color: colors.foreground }]}>{title}</Text>
      {issue.status === "failed" && (
        <>
          <Hint tone="danger">Сервер не принял изменение: {issue.error}</Hint>
          <View style={styles.actions}>
            <Button title="Повторить" variant="link" onPress={() => void store.keepMine(issue.seq)} />
            <Button title="Отменить изменение" variant="link" onPress={() => void store.takeServer(issue.seq)} />
          </View>
        </>
      )}
      {issue.status === "conflict" && (
        <>
          <Hint>
            {issue.conflict?.reason === "duplicate"
              ? "Эту запись уже изменили на другом устройстве."
              : "Это же изменили на другом устройстве:"}
          </Hint>
          {issue.conflict?.fields.map((field) => (
            <Text key={field} style={[styles.diff, { color: colors.muted }]}>
              {FIELD_LABEL[field] ?? field}: у вас {show(issue.patch?.[field])}, на сервере {show(issue.conflict?.server[field])}
            </Text>
          ))}
          <View style={styles.actions}>
            <Button title="Оставить мою" variant="link" onPress={() => void store.keepMine(issue.seq)} />
            <Button title="Взять с сервера" variant="link" onPress={() => void store.takeServer(issue.seq)} />
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 6 },
  cardTitle: { fontSize: 15, fontWeight: "600" },
  diff: { fontSize: 13 },
  actions: { flexDirection: "row", gap: 16, flexWrap: "wrap" },
});
