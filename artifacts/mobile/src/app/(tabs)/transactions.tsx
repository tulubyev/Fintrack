import { useEffect, useMemo, useState } from "react";
import { Alert, RefreshControl, ScrollView, SectionList, StyleSheet, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fromKopecks } from "@workspace/shared/money";
import { store } from "@/data/device";
import { useLocal, useLookup, useRefresh } from "@/data/hooks";
import type { ListOptions } from "@/data/store";
import { deleteTransaction } from "@/data/transactions";
import { transactionTitle, type Account, type Category, type Transaction } from "@/data/types";
import { dayTitle, periodRange, type Period } from "@/lib/dates";
import { pickCategory } from "@/lib/picker";
import { SwipeRow } from "@/ui/SwipeRow";
import { SyncBanner } from "@/ui/SyncBanner";
import { TransactionRow } from "@/ui/TransactionRow";
import { useCategoryChange } from "@/ui/useCategoryChange";
import { Button, Chip, EmptyState, Icon, Label, Sheet, Title, useColors } from "@/ui/kit";

const PAGE = 50;
const PERIODS: { value: Period; label: string }[] = [
  { value: "all", label: "Всё время" },
  { value: "month", label: "Этот месяц" },
  { value: "prev", label: "Прошлый" },
  { value: "3m", label: "3 месяца" },
];
const TYPES = [
  { value: "expense", label: "Расходы" },
  { value: "income", label: "Доходы" },
  { value: "transfer", label: "Переводы" },
];

const toggle = (list: string[], value: string) => (list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
const rub = (kopecks: bigint) => `${Number(fromKopecks(kopecks)).toLocaleString("ru-RU", { maximumFractionDigits: 0 })} ₽`;

/**
 * Лента операций (E2.1-T7): по дням, с подгрузкой; поиск по получателю, описанию и заметке; период, тип, счёт,
 * категория, «без категории»; итоги по фильтру. Свайп вправо — категория, влево — удалить.
 * Параметры адреса (?uncategorized=1, ?period=month, ?categoryId=…) задают начальный фильтр — с главной и по ссылке.
 */
export default function Transactions() {
  const params = useLocalSearchParams<{ uncategorized?: string; period?: Period; categoryId?: string; accountId?: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const refresh = useRefresh();
  const categories = useLookup<Category>("categories");
  const accounts = useLocal(() => store.list<Account>("accounts"), []);
  const { change, sheet } = useCategoryChange();

  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [period, setPeriod] = useState<Period>("all");
  const [types, setTypes] = useState<string[]>([]);
  const [accountIds, setAccountIds] = useState<string[]>([]);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [uncategorized, setUncategorized] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [limit, setLimit] = useState(PAGE);

  useEffect(() => {
    // переход с параметрами (с главной, со счёта, по ссылке) задаёт фильтр целиком, а не дополняет прежний
    if (!params.uncategorized && !params.period && !params.categoryId && !params.accountId) return;
    setSearch("");
    setUncategorized(params.uncategorized === "1");
    setTypes(params.uncategorized === "1" ? ["expense", "income"] : []);
    setPeriod(params.period ?? "all");
    setCategoryId(params.categoryId ?? null);
    setAccountIds(params.accountId ? [params.accountId] : []);
  }, [params.uncategorized, params.period, params.categoryId, params.accountId]);

  useEffect(() => {
    const timer = setTimeout(() => setQuery(search), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const filter: ListOptions = useMemo(() => {
    // категория-родитель включает подкатегории
    const categoryIds = categoryId ? [categoryId, ...[...categories.values()].filter((item) => item.parentId === categoryId).map((item) => item.id)] : undefined;
    return { ...periodRange(period), types, accountIds, categoryIds, uncategorized, search: query };
  }, [period, types, accountIds, categoryId, uncategorized, query, categories]);
  const key = JSON.stringify(filter);
  useEffect(() => setLimit(PAGE), [key]);

  const rows = useLocal(() => store.list<Transaction>("transactions", { ...filter, limit }), [key, limit]);
  const totals = useLocal(() => store.totals("transactions", filter), [key]);

  const sections = useMemo(() => {
    const days: { title: string; data: Transaction[] }[] = [];
    for (const tx of rows ?? []) {
      const title = dayTitle(tx.date);
      const last = days[days.length - 1];
      if (last?.title === title) last.data.push(tx);
      else days.push({ title, data: [tx] });
    }
    return days;
  }, [rows]);

  const filtered = period !== "all" || types.length > 0 || accountIds.length > 0 || categoryId !== null || uncategorized || query !== "";
  const extraFilters = accountIds.length + (categoryId ? 1 : 0) + (uncategorized ? 1 : 0);
  const reset = () => {
    setPeriod("all");
    setTypes([]);
    setAccountIds([]);
    setCategoryId(null);
    setUncategorized(false);
    setSearch("");
  };

  const remove = (tx: Transaction) =>
    Alert.alert("Удалить операцию?", transactionTitle(tx), [
      { text: "Отмена", style: "cancel" },
      { text: "Удалить", style: "destructive", onPress: () => void deleteTransaction(store, tx.id) },
    ]);

  const chooseCategory = async () => {
    const picked = await pickCategory({});
    if (picked) setCategoryId(picked);
  };

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
      <Title>Операции</Title>
      <SyncBanner />
      <View style={[styles.search, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Icon name="search" size={18} tone="muted" />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Поиск: получатель, описание, заметка"
          placeholderTextColor={colors.muted}
          style={[styles.searchInput, { color: colors.foreground }]}
          returnKeyType="search"
          clearButtonMode="while-editing"
          testID="feed-search"
        />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {PERIODS.map((item) => <Chip key={item.value} label={item.label} selected={period === item.value} onPress={() => setPeriod(item.value)} testID={`period-${item.value}`} />)}
        {TYPES.map((item) => <Chip key={item.value} label={item.label} selected={types.includes(item.value)} onPress={() => setTypes(toggle(types, item.value))} testID={`type-${item.value}`} />)}
        <Chip label={extraFilters ? `Фильтры · ${extraFilters}` : "Фильтры"} selected={extraFilters > 0} onPress={() => setFiltersOpen(true)} testID="feed-filters" />
      </ScrollView>
      {totals && totals.count > 0 && (
        <Label variant="caption" tone="muted" testID="feed-totals">
          {[totals.expense ? `Расходы ${rub(totals.expense)}` : null, totals.income ? `Доходы ${rub(totals.income)}` : null, `${totals.count} опер.`]
            .filter(Boolean).join(" · ")}
        </Label>
      )}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SectionList
        sections={sections}
        keyExtractor={(tx) => tx.id}
        ListHeaderComponent={header}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => (
          <View style={styles.dayTitle}><Label variant="caption" tone="muted">{section.title.toUpperCase()}</Label></View>
        )}
        renderItem={({ item, index, section }) => (
          <View style={[styles.rowWrap, { backgroundColor: colors.card, borderColor: colors.border }, index === 0 && styles.first, index === section.data.length - 1 && styles.last]}>
            <SwipeRow
              left={{ label: "Категория", icon: "pricetag-outline", tone: "primary", onPress: () => void change(item), testID: `swipe-category-${item.id}` }}
              right={item.type === "transfer" ? undefined : { label: "Удалить", icon: "trash-outline", tone: "danger", onPress: () => remove(item), testID: `swipe-delete-${item.id}` }}
            >
              <View style={{ backgroundColor: colors.card }}>
                <TransactionRow tx={item} category={item.categoryId ? categories.get(item.categoryId) : undefined} showDate={false} />
              </View>
            </SwipeRow>
          </View>
        )}
        ItemSeparatorComponent={() => (
          <View style={[styles.separatorWrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.separator, { backgroundColor: colors.border }]} />
          </View>
        )}
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (rows && rows.length >= limit) setLimit(limit + PAGE);
        }}
        refreshControl={<RefreshControl refreshing={refresh.refreshing} onRefresh={refresh.onRefresh} tintColor={colors.primarySolid} />}
        ListEmptyComponent={
          rows === undefined ? undefined : filtered ? (
            <EmptyState icon="search-outline" title="Ничего не нашлось" action={<Button title="Сбросить фильтры" variant="link" onPress={reset} />} />
          ) : (
            <EmptyState icon="list-outline" title="Операций пока нет" action={<Button title="Записать трату" icon="add" onPress={() => router.push("/quick-add")} />} />
          )
        }
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      />

      <Sheet visible={filtersOpen} onClose={() => setFiltersOpen(false)} title="Фильтры">
        {(accounts ?? []).length > 1 && (
          <View style={styles.block}>
            <Label variant="caption" tone="muted">Счета</Label>
            <View style={styles.wrap}>
              {(accounts ?? []).filter((account) => !account.archivedAt).map((account) => (
                <Chip key={account.id} label={account.name} selected={accountIds.includes(account.id)} onPress={() => setAccountIds(toggle(accountIds, account.id))} />
              ))}
            </View>
          </View>
        )}
        <View style={styles.block}>
          <Label variant="caption" tone="muted">Категория</Label>
          <View style={styles.wrap}>
            <Chip label="Без категории" selected={uncategorized} onPress={() => setUncategorized(!uncategorized)} testID="filter-uncategorized" />
            <Chip
              label={categoryId ? categories.get(categoryId)?.name ?? "Категория" : "Выбрать категорию…"}
              selected={categoryId !== null}
              onPress={() => {
                if (categoryId) return setCategoryId(null);
                // экран выбора откроется под модальным листом — сначала закрываем лист
                setFiltersOpen(false);
                void chooseCategory();
              }}
              testID="filter-category"
            />
          </View>
        </View>
        <Button title="Готово" onPress={() => setFiltersOpen(false)} />
        {filtered && <Button title="Сбросить все" variant="link" onPress={() => { reset(); setFiltersOpen(false); }} />}
      </Sheet>
      {sheet}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingBottom: 24 },
  header: { gap: 12, paddingBottom: 4 },
  search: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, paddingHorizontal: 12 },
  searchInput: { flex: 1, fontSize: 16, paddingVertical: 10 },
  chips: { gap: 8, paddingRight: 16 },
  dayTitle: { paddingTop: 16, paddingBottom: 6, paddingHorizontal: 4 },
  rowWrap: { borderLeftWidth: StyleSheet.hairlineWidth, borderRightWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  first: { borderTopWidth: StyleSheet.hairlineWidth, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  last: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomLeftRadius: 16, borderBottomRightRadius: 16 },
  separatorWrap: { borderLeftWidth: StyleSheet.hairlineWidth, borderRightWidth: StyleSheet.hairlineWidth },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: 16 },
  block: { gap: 6 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
