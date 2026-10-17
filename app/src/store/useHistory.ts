import { useMemo } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { Drama } from '@/api/types';

import { dramaKey, persistStorage, STORAGE_PREFIX } from './storage';

export interface HistoryEntry {
  drama: Drama;
  /** The episode "continue watching" resumes. Peeking at another episode doesn't move it. */
  lastEpisode: number;
  /** Position / duration of `lastEpisode` (for progress bars). */
  positionSec: number;
  durationSec: number;
  updatedAt: number;
  /** Episodes fully (>= 90%) watched. */
  watched: Record<number, true>;
  /** Per-episode resume positions, seconds. Completed episodes store 0 (rewatch from the start). */
  positions: Record<number, number>;
}

export interface SaveProgressInput {
  drama: Drama;
  episode: number;
  positionSec: number;
  durationSec: number;
  /** Force-mark the episode as watched (e.g. on playToEnd). */
  completed?: boolean;
  /** Seconds actually played in this viewing session (excludes seeks). */
  watchedSec?: number;
}

export interface HistoryState {
  /** Keyed by `${source}:${id}`. */
  entries: Record<string, HistoryEntry>;
  saveProgress: (input: SaveProgressInput) => void;
  markWatched: (drama: Drama, episode: number) => void;
  getEntry: (source: string, id: string) => HistoryEntry | undefined;
  /**
   * Imperative getter, sorted by updatedAt desc. Do NOT call inside a zustand selector
   * (returns a new array each call) — use the `useContinueWatching()` hook in components.
   */
  continueWatching: () => HistoryEntry[];
  remove: (source: string, id: string) => void;
  clear: () => void;
}

const WATCHED_THRESHOLD = 0.9;
const MAX_ENTRIES = 200;
/** Watching another episode at least this long makes it the new resume episode. */
const COMMIT_SEC = 10;

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

function prune(entries: Record<string, HistoryEntry>): Record<string, HistoryEntry> {
  const keys = Object.keys(entries);
  if (keys.length <= MAX_ENTRIES) return entries;
  const keep = keys
    .sort((a, b) => entries[b].updatedAt - entries[a].updatedAt)
    .slice(0, MAX_ENTRIES);
  return Object.fromEntries(keep.map((k) => [k, entries[k]]));
}

export const useHistory = create<HistoryState>()(
  persist(
    (set, get) => ({
      entries: {},
      saveProgress: ({ drama, episode, positionSec, durationSec, completed, watchedSec }) =>
        set((s) => {
          const key = dramaKey(drama.source, drama.id);
          const prev = s.entries[key];
          const done =
            completed || (durationSec > 0 && positionSec / durationSec >= WATCHED_THRESHOLD);
          const watched = done ? { ...(prev?.watched ?? {}), [episode]: true as const } : (prev?.watched ?? {});
          const positions = { ...(prev?.positions ?? {}), [episode]: done ? 0 : Math.max(0, positionSec) };
          // A short peek at another episode must not steal the resume point.
          const commit =
            !prev ||
            episode === prev.lastEpisode ||
            episode === prev.lastEpisode + 1 ||
            !!completed ||
            (watchedSec ?? 0) >= COMMIT_SEC;
          const entry: HistoryEntry = commit
            ? {
                drama: snapshot(drama),
                lastEpisode: episode,
                positionSec: Math.max(0, positionSec),
                durationSec: Math.max(0, durationSec),
                updatedAt: Date.now(),
                watched,
                positions,
              }
            : { ...prev, drama: snapshot(drama), updatedAt: Date.now(), watched, positions };
          return { entries: prune({ ...s.entries, [key]: entry }) };
        }),
      markWatched: (drama, episode) =>
        set((s) => {
          const key = dramaKey(drama.source, drama.id);
          const prev = s.entries[key];
          const entry: HistoryEntry = prev
            ? {
                ...prev,
                watched: { ...prev.watched, [episode]: true },
                positions: { ...prev.positions, [episode]: 0 },
                updatedAt: Date.now(),
              }
            : {
                drama: snapshot(drama),
                lastEpisode: episode,
                positionSec: 0,
                durationSec: 0,
                updatedAt: Date.now(),
                watched: { [episode]: true },
                positions: { [episode]: 0 },
              };
          return { entries: { ...s.entries, [key]: entry } };
        }),
      getEntry: (source, id) => get().entries[dramaKey(source, id)],
      continueWatching: () =>
        Object.values(get().entries).sort((a, b) => b.updatedAt - a.updatedAt),
      remove: (source, id) =>
        set((s) => {
          const next = { ...s.entries };
          delete next[dramaKey(source, id)];
          return { entries: next };
        }),
      clear: () => set({ entries: {} }),
    }),
    {
      name: `${STORAGE_PREFIX}history`,
      version: 2,
      storage: persistStorage,
      partialize: (s) => ({ entries: s.entries }),
      // v1 → v2: seed per-episode positions from the single resume slot.
      migrate: (persisted, version) => {
        const state = (persisted ?? {}) as { entries?: Record<string, HistoryEntry> };
        if (version < 2 && state.entries) {
          state.entries = Object.fromEntries(
            Object.entries(state.entries).map(([k, e]) => [
              k,
              {
                ...e,
                positions: e.positions ?? { [e.lastEpisode]: e.watched?.[e.lastEpisode] ? 0 : e.positionSec },
              },
            ]),
          );
        }
        return state as Pick<HistoryState, 'entries'>;
      },
    },
  ),
);

/**
 * Where to resume `episode` (seconds), or 0. Never resumes within the last 3s of a known duration.
 * Falls back to the legacy single slot for entries without a per-episode position.
 */
export function resumePosition(entry: HistoryEntry | undefined, episode: number): number {
  if (!entry) return 0;
  const pos =
    entry.positions?.[episode] ??
    (entry.lastEpisode === episode && !entry.watched[episode] ? entry.positionSec : 0);
  if (!pos || pos < 3) return 0;
  if (entry.lastEpisode === episode && entry.durationSec > 0 && pos > entry.durationSec - 3) return 0;
  return pos;
}

/** Reactive single entry. */
export function useHistoryEntry(source: string | undefined, id: string | undefined): HistoryEntry | undefined {
  return useHistory((s) => (source && id ? s.entries[dramaKey(source, id)] : undefined));
}

/** Reactive continue-watching list, sorted by updatedAt desc. */
export function useContinueWatching(limit?: number): HistoryEntry[] {
  const entries = useHistory((s) => s.entries);
  return useMemo(() => {
    const list = Object.values(entries).sort((a, b) => b.updatedAt - a.updatedAt);
    return limit ? list.slice(0, limit) : list;
  }, [entries, limit]);
}
