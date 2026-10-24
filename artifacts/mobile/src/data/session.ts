import type { SessionEvent } from "../auth/controller";
import type { LocalStore } from "./store";
import type { SyncEngine } from "./sync";

const OWNER_KEY = "owner";

/**
 * Локальные данные принадлежат одному пользователю.
 * - Явный выход и 5 неверных PIN стирают всё: на устройстве не остаётся финансовых данных.
 * - Сессия закончилась сама — данные и неотправленные правки остаются (база зашифрована), и после входа того же
 *   пользователя правки уйдут. Вошёл другой — сначала стираем чужое.
 */
export async function handleSessionEvent(store: LocalStore, engine: SyncEngine, event: SessionEvent): Promise<void> {
  if (event.type === "signedIn") {
    const owner = await store.getKv(OWNER_KEY);
    if (!event.userId || owner !== event.userId) await store.wipe();
    if (event.userId) await store.setKv(OWNER_KEY, event.userId);
    return;
  }
  engine.stop();
  if (event.reason === "logout") await store.wipe();
}
