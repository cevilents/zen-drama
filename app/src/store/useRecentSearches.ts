import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { persistStorage, STORAGE_PREFIX } from './storage';

const MAX_RECENT = 10;

export interface RecentSearchesState {
  queries: string[];
  add: (q: string) => void;
  remove: (q: string) => void;
  clear: () => void;
}

export const useRecentSearches = create<RecentSearchesState>()(
  persist(
    (set) => ({
      queries: [],
      add: (q) =>
        set((s) => {
          const query = q.trim();
          if (query.length < 2) return s;
          const rest = s.queries.filter((x) => x.toLowerCase() !== query.toLowerCase());
          return { queries: [query, ...rest].slice(0, MAX_RECENT) };
        }),
      remove: (q) => set((s) => ({ queries: s.queries.filter((x) => x !== q) })),
      clear: () => set({ queries: [] }),
    }),
    {
      name: `${STORAGE_PREFIX}recent-searches`,
      version: 1,
      storage: persistStorage,
      partialize: (s) => ({ queries: s.queries }),
    },
  ),
);
