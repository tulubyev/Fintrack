import { useEffect, useState, useSyncExternalStore } from "react";
import { store, sync } from "./device";
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
