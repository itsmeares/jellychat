import { useSyncExternalStore } from "react";

type Store<T> = { getState: () => T; subscribe: (listener: () => void) => () => void };

export function useStore<T>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.getState);
}
