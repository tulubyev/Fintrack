import { useEffect, useState, useSyncExternalStore } from "react";
import { store, sync } from "./device";
import type { Entity } from "./store";
import type { SyncState } from "./sync";

export function useSyncState(): SyncState {
  return useSyncExternalStore(sync.subscribe, sync.getState);
}

/**
 * Данные экрана из локальной базы: читаются сразу и перечитываются после любой правки или синхронизации.
 * Пример: useLocal(() => store.list("transactions", { limit: 50 }), []).
 */
export function useLocal<T>(read: () => Promise<T>, deps: unknown[]): T | undefined {
  const [value, setValue] = useState<T>();
  useEffect(() => {
    let active = true;
    const load = () => {
      read().then((next) => active && setValue(next)).catch(() => undefined);
    };
    load();
    const unsubscribe = store.subscribe(load);
    return () => {
      active = false;
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return value;
}

/** Справочник по id — подписи категорий и счетов в списках. */
export function useLookup<T extends { id: string }>(entity: Entity): Map<string, T> {
  const rows = useLocal(() => store.list<T>(entity), [entity]);
  const [map, setMap] = useState(() => new Map<string, T>());
  useEffect(() => setMap(new Map((rows ?? []).map((row) => [row.id, row]))), [rows]);
  return map;
}

/** Жест «потянуть вниз»: синхронизация с индикатором. */
export function useRefresh(): { refreshing: boolean; onRefresh: () => void } {
  const [refreshing, setRefreshing] = useState(false);
  return {
    refreshing,
    onRefresh: () => {
      setRefreshing(true);
      void sync.sync({ now: true }).finally(() => setRefreshing(false));
    },
  };
}
