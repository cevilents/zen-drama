import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { ContentLanguage } from '@/api/types';

import { persistStorage, STORAGE_PREFIX } from './storage';

export type PlaybackRate = 0.75 | 1 | 1.25 | 1.5 | 2;
export const PLAYBACK_RATES: PlaybackRate[] = [0.75, 1, 1.25, 1.5, 2];

/** Catalog language sent as `lang` on every API request (docs/LANG_CONTRACT.md). */
export type ContentLang = ContentLanguage;
/** "auto" = content language, then English, then Indonesian; "off" = no subtitles. */
export type SubtitleLang = 'auto' | 'id' | 'en' | 'off';

export interface SettingsState {
  autoplayNext: boolean;
  /** "auto" or a Quality.label from the server (e.g. "720p"). */
  preferredQuality: string;
  playbackRate: PlaybackRate;
  dataSaver: boolean;
  contentLang: ContentLang;
  subtitleLang: SubtitleLang;
  /** User-entered server URL, e.g. "http://192.168.1.10:3030". null = auto-detect. */
  serverUrl: string | null;
  /** Last address read from the server pointer (https, no trailing slash). Kept so a cold start can use it at once. */
  discoveredServerUrl: string | null;

  setAutoplayNext: (v: boolean) => void;
  setPreferredQuality: (v: string) => void;
  setPlaybackRate: (v: PlaybackRate) => void;
  setDataSaver: (v: boolean) => void;
  setContentLang: (v: ContentLang) => void;
  setSubtitleLang: (v: SubtitleLang) => void;
  setServerUrl: (v: string | null) => void;
  setDiscoveredServerUrl: (v: string | null) => void;
  reset: () => void;
}

const defaults = {
  autoplayNext: true,
  preferredQuality: 'auto',
  playbackRate: 1 as PlaybackRate,
  dataSaver: false,
  contentLang: 'id' as ContentLang,
  subtitleLang: 'auto' as SubtitleLang,
  serverUrl: null as string | null,
};

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      ...defaults,
      discoveredServerUrl: null,
      setAutoplayNext: (autoplayNext) => set({ autoplayNext }),
      setPreferredQuality: (preferredQuality) => set({ preferredQuality }),
      setPlaybackRate: (playbackRate) => set({ playbackRate }),
      setDataSaver: (dataSaver) => set({ dataSaver }),
      setContentLang: (contentLang) => set({ contentLang }),
      setSubtitleLang: (subtitleLang) => set({ subtitleLang }),
      setServerUrl: (v) => set({ serverUrl: v && v.trim() ? v.trim() : null }),
      setDiscoveredServerUrl: (discoveredServerUrl) => set({ discoveredServerUrl }),
      // Not part of the user's preferences, so reset() leaves discoveredServerUrl alone.
      reset: () => set(defaults),
    }),
    {
      name: `${STORAGE_PREFIX}settings`,
      // Still v1: contentLang/subtitleLang are additive and the default merge fills them from `defaults`.
      version: 1,
      storage: persistStorage,
    },
  ),
);
