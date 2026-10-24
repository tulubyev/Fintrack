import { useSyncExternalStore } from "react";
import { auth } from "./device";
import type { AuthState } from "./controller";

export function useAuth(): AuthState {
  return useSyncExternalStore(auth.subscribe, auth.getState);
}
