import Storage from 'expo-sqlite/kv-store';
import { useSyncExternalStore } from 'react';

/** Asked once on each phone. It stays through sign-out, so a returning owner goes straight to signing in. */
const CATEGORY_KEY = 'dt.category';

let chosen = Storage.getItemSync(CATEGORY_KEY) !== null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useCategoryChosen(): boolean {
  return useSyncExternalStore(subscribe, () => chosen);
}

/** Buses are the only category that works for now. */
export function chooseBus(): void {
  Storage.setItemSync(CATEGORY_KEY, 'bus');
  chosen = true;
  listeners.forEach((listener) => listener());
}
