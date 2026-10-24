import Constants, { ExecutionEnvironment } from "expo-constants";
import * as Crypto from "expo-crypto";
import * as Network from "expo-network";
import * as SecureStore from "expo-secure-store";
import * as SQLite from "expo-sqlite";
import { AppState } from "react-native";
import { api, auth } from "@/auth/device";
import type { SqlDb } from "./db";
import { handleSessionEvent } from "./session";
import { LocalStore } from "./store";
import { SyncEngine } from "./sync";
import { uuidv7 } from "./uuid";

/**
 * Локальная база на устройстве: expo-sqlite с SQLCipher (ключ — в SecureStore, в резервную копию не попадает).
 * В Expo Go SQLCipher нет — там база без шифрования, это только для разработки; в сборке без шифрования
 * приложение данные не хранит.
 */

const DB_NAME = "fintrack.db";
const KEY_NAME = "db.key";
const KEY_OPTIONS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
const SYNC_EVERY_MS = 15 * 60_000;

const toHex = (bytes: Uint8Array) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

async function databaseKey(): Promise<string> {
  const existing = await SecureStore.getItemAsync(KEY_NAME, KEY_OPTIONS);
  if (existing) return existing;
  const key = toHex(Crypto.getRandomBytes(32));
  await SecureStore.setItemAsync(KEY_NAME, key, KEY_OPTIONS);
  return key;
}

async function openDatabase(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(DB_NAME);
  const cipher = await db.getFirstAsync<{ cipher_version: string }>("PRAGMA cipher_version");
  if (cipher) {
    // Сырой 256-битный ключ — без медленного вывода ключа из пароля при каждом запуске
    await db.execAsync(`PRAGMA key = "x'${await databaseKey()}'"`);
  } else if (Constants.executionEnvironment !== ExecutionEnvironment.StoreClient) {
    await db.closeAsync();
    throw new Error("В сборке нет SQLCipher — данные без шифрования не храним");
  }
  // Удалённое затирается на диске, а не остаётся в свободных страницах файла
  await db.execAsync("PRAGMA journal_mode = WAL; PRAGMA secure_delete = ON;");
  return db;
}

/** SqlDb поверх expo-sqlite. Открывается при первом запросе. */
function expoSqlite(): SqlDb {
  let opening: Promise<SQLite.SQLiteDatabase> | null = null;
  const conn = () => (opening ??= openDatabase().catch((error) => {
    opening = null;
    throw error;
  }));
  const db: SqlDb = {
    exec: async (sql) => (await conn()).execAsync(sql),
    run: async (sql, params = []) => {
      await (await conn()).runAsync(sql, params);
    },
    all: async (sql, params = []) => (await conn()).getAllAsync(sql, params),
    first: async (sql, params = []) => (await conn()).getFirstAsync(sql, params),
    // Обычная транзакция на том же соединении: у эксклюзивной своё соединение, и ключ SQLCipher на нём не задан.
    // Записи и так идут строго по одной (LocalStore), чтение внутри транзакции безвредно.
    transaction: async (fn) => {
      let result: Awaited<ReturnType<typeof fn>>;
      await (await conn()).withTransactionAsync(async () => {
        result = await fn(db);
      });
      return result!;
    },
  };
  return db;
}

export const store = new LocalStore(expoSqlite());
export const sync = new SyncEngine({ store, request: api });
export const newId = () => uuidv7(Crypto.getRandomBytes);

auth.onSessionEvent((event) => handleSessionEvent(store, sync, event));

/**
 * Когда синхронизироваться: при входе и разблокировке, при возврате в приложение, когда появилась сеть,
 * и раз в 15 минут, пока приложение открыто. В фоне — позже, вместе с push «данные обновились» (E2.2).
 */
export function startDataSync(): () => void {
  let ready = false;
  const ensureOpen = store.open().catch(() => undefined);

  const run = (options?: { now?: boolean }) => {
    if (ready) void ensureOpen.then(() => sync.sync(options));
  };

  const onAuth = () => {
    const isReady = auth.getState().status === "ready";
    if (isReady && !ready) {
      ready = true;
      void ensureOpen.then(() => sync.init()).then(() => run({ now: true }));
    } else if (!isReady) {
      ready = false;
    }
  };
  const unsubscribeAuth = auth.subscribe(onAuth);
  onAuth();

  const appState = AppState.addEventListener("change", (state) => {
    if (state === "active") run();
  });
  const network = Network.addNetworkStateListener((state) => {
    if (state.isConnected && state.isInternetReachable !== false) run({ now: true });
  });
  const interval = setInterval(() => {
    if (AppState.currentState === "active") run();
  }, SYNC_EVERY_MS);

  return () => {
    unsubscribeAuth();
    appState.remove();
    network.remove();
    clearInterval(interval);
    sync.stop();
  };
}
