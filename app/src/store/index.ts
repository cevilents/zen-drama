import { useSyncExternalStore } from 'react';

import { useHistory } from './useHistory';
import { useLibrary } from './useLibrary';
import { useRecentSearches } from './useRecentSearches';
import { useSettings } from './useSettings';

export * from './useHistory';
export * from './useLibrary';
export * from './useRecentSearches';
export * from './useSettings';
export { useToast, toast } from './useToast';
export { dramaKey } from './storage';

const persisted = [useHistory, useLibrary, useRecentSearches, useSettings] as const;

/**
 * zustand's persist never flags a store as hydrated (nor calls onFinishHydration) when
 * rehydration throws (corrupt JSON, storage failure, migrate error). After this long we
 * proceed with whatever state the stores have (defaults) so the app never hangs on the splash.
 */
const HYDRATION_FALLBACK_MS = 1500;
let hydrationTimedOut = false;
const fallbackListeners = new Set<() => void>();

setTimeout(() => {
  hydrationTimedOut = true;
  fallbackListeners.forEach((l) => l());
}, HYDRATION_FALLBACK_MS);

function allHydrated(): boolean {
  return hydrationTimedOut || persisted.every((s) => s.persist.hasHydrated());
}

function subscribeHydration(onChange: () => void): () => void {
  fallbackListeners.add(onChange);
  const unsubs = persisted.map((s) => s.persist.onFinishHydration(onChange));
  return () => {
    fallbackListeners.delete(onChange);
    unsubs.forEach((u) => u());
  };
}

/** True once every persisted store has rehydrated from AsyncStorage (or the fallback elapsed). */
export function useStoresHydrated(): boolean {
  return useSyncExternalStore(subscribeHydration, allHydrated, allHydrated);
}
