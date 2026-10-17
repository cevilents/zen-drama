import AsyncStorage from '@react-native-async-storage/async-storage';
import { createJSONStorage } from 'zustand/middleware';

/** Shared persist storage. AsyncStorage falls back to localStorage on web. */
export const persistStorage = createJSONStorage(() => AsyncStorage);

// Pre-rebrand prefix; renaming it would orphan favorites and history already saved on devices.
export const STORAGE_PREFIX = 'dracin:';

export function dramaKey(source: string, id: string): string {
  return `${source}:${id}`;
}
