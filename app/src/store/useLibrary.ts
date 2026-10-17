import { useMemo } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { Drama } from '@/api/types';

import { dramaKey, persistStorage, STORAGE_PREFIX } from './storage';

export interface FavoriteEntry {
  drama: Drama;
  addedAt: number;
}

export interface LibraryState {
  /** Keyed by `${source}:${id}`. */
  favorites: Record<string, FavoriteEntry>;
  /** Returns the new state: true = now a favorite. */
  toggleFavorite: (drama: Drama) => boolean;
  addFavorite: (drama: Drama) => void;
  removeFavorite: (source: string, id: string) => void;
  isFavorite: (source: string, id: string) => boolean;
  clear: () => void;
}

/** Store a lean snapshot (drop large/transient fields like `episodes`). */
function snapshot(d: Drama): Drama {
  return {
    id: d.id,
    source: d.source,
    title: d.title,
    cover: d.cover,
    banner: d.banner,
    description: d.description,
    tags: d.tags,
    totalEpisodes: d.totalEpisodes,
    viewCount: d.viewCount,
    isCompleted: d.isCompleted,
  };
}

export const useLibrary = create<LibraryState>()(
  persist(
    (set, get) => ({
      favorites: {},
      toggleFavorite: (drama) => {
        const key = dramaKey(drama.source, drama.id);
        const exists = !!get().favorites[key];
        set((s) => {
          const next = { ...s.favorites };
          if (exists) delete next[key];
          else next[key] = { drama: snapshot(drama), addedAt: Date.now() };
          return { favorites: next };
        });
        return !exists;
      },
      addFavorite: (drama) =>
        set((s) => ({
          favorites: {
            ...s.favorites,
            [dramaKey(drama.source, drama.id)]: { drama: snapshot(drama), addedAt: Date.now() },
          },
        })),
      removeFavorite: (source, id) =>
        set((s) => {
          const next = { ...s.favorites };
          delete next[dramaKey(source, id)];
          return { favorites: next };
        }),
      isFavorite: (source, id) => !!get().favorites[dramaKey(source, id)],
      clear: () => set({ favorites: {} }),
    }),
    {
      name: `${STORAGE_PREFIX}library`,
      version: 1,
      storage: persistStorage,
      partialize: (s) => ({ favorites: s.favorites }),
    },
  ),
);

/** Reactive boolean for a single drama. */
export function useIsFavorite(source: string | undefined, id: string | undefined): boolean {
  return useLibrary((s) => (source && id ? !!s.favorites[dramaKey(source, id)] : false));
}

/** Favorites sorted newest-first. Stable between renders unless favorites change. */
export function useFavorites(): FavoriteEntry[] {
  const favorites = useLibrary((s) => s.favorites);
  return useMemo(
    () => Object.values(favorites).sort((a, b) => b.addedAt - a.addedAt),
    [favorites],
  );
}
