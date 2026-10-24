import { useState } from "react";
import { api } from "@/auth/device";
import { store } from "@/data/device";
import { updateTransaction } from "@/data/transactions";
import type { Transaction } from "@/data/types";
import { pickCategory } from "@/lib/picker";
import { Button, Hint, ListItem, Section, Sheet } from "./kit";

type Scope = "none" | "future" | "future_and_past";

interface Similar {
  similar: { label: string } | null;
  pastCount: number;
}

/** Похожие операции для «эта и будущие» — только с сервера; без сети или для ещё не отправленной операции — null. */
async function fetchSimilar(id: string): Promise<Similar | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4_000);
  try {
    return await api<Similar>(`/api/v1/transactions/${id}/similar`, { signal: controller.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Смена категории операции, как на сайте (TransactionSheet): выбрать категорию, затем — если сервер видит похожие
 * операции — «только эта / эта и будущие (правило) / и прошлые». Без сети меняется только эта операция.
 * Возвращает change(tx) и лист с вопросом, который нужно отрисовать на экране.
 */
export function useCategoryChange() {
  const [pending, setPending] = useState<{ tx: Transaction; categoryId: string; similar: Similar & { similar: { label: string } } } | null>(null);

  const change = async (tx: Transaction) => {
    const picked = await pickCategory({ kind: tx.type === "income" ? "income" : "expense", allowNone: true });
    if (picked === undefined || picked === tx.categoryId) return;
    const categorizable = (tx.type === "expense" || tx.type === "income") && picked !== null;
    const similar = categorizable ? await fetchSimilar(tx.id) : null;
    if (!similar?.similar || picked === null) {
      await updateTransaction(store, tx.id, { categoryId: picked });
      return;
    }
    setPending({ tx, categoryId: picked, similar: { ...similar, similar: similar.similar } });
  };

  const apply = async (scope: Scope) => {
    if (!pending) return;
    setPending(null);
    await updateTransaction(store, pending.tx.id, { categoryId: pending.categoryId }, scope);
  };

  const sheet = (
    <Sheet visible={pending !== null} onClose={() => setPending(null)} title={pending ? `Применить к «${pending.similar.similar.label}»` : undefined}>
      <Hint>Правило будет ставить эту категорию похожим операциям автоматически.</Hint>
      <Section>
        <ListItem title="Только эта операция" onPress={() => void apply("none")} chevron={false} testID="scope-none" />
        <ListItem title="Эта и будущие" onPress={() => void apply("future")} chevron={false} testID="scope-future" />
        <ListItem
          title={`Эта, будущие и прошлые${pending?.similar.pastCount ? ` (найдено ${pending.similar.pastCount})` : ""}`}
          onPress={() => void apply("future_and_past")}
          chevron={false}
          testID="scope-past"
        />
      </Section>
      <Button title="Отмена" variant="link" onPress={() => setPending(null)} />
    </Sheet>
  );

  return { change, sheet };
}
