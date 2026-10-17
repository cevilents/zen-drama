import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import { useCallback, useEffect } from 'react';

import { useSettings } from '@/store/useSettings';

import { api, getBaseUrl, isStaleStreamUrl } from './client';
import type { ContentLanguage, Drama, EpisodePlay, ListType, Paged } from './types';

const MIN = 60_000;
/**
 * Episode play URLs are signed and short-lived: drop unobserved ones quickly so a long-cached,
 * expired URL isn't handed to the player much later.
 */
const EPISODE_GC_MS = 2 * MIN;

/**
 * Every key except health carries the content language (apiGet sends it as `lang`), so switching
 * language fetches the other catalog instead of showing the cached one.
 */
export const queryKeys = {
  home: (lang: ContentLanguage) => ['home', lang] as const,
  sources: (lang: ContentLanguage) => ['sources', lang] as const,
  health: ['health'] as const,
  feed: (lang: ContentLanguage) => ['feed', lang] as const,
  list: (source: string, type: ListType, lang: ContentLanguage) => ['list', lang, source, type] as const,
  search: (q: string, source: string | undefined, lang: ContentLanguage) =>
    ['search', lang, q.trim().toLowerCase(), source ?? 'all'] as const,
  detail: (source: string, id: string, lang: ContentLanguage) => ['detail', lang, source, id] as const,
  episode: (source: string, id: string, ep: number, lang: ContentLanguage) =>
    ['episode', lang, source, id, ep] as const,
};

/** Current content language; part of every catalog query key. */
export function useContentLang(): ContentLanguage {
  return useSettings((s) => s.contentLang);
}

/** The language a catalog key was built with (always right after the key's name). */
function keyLang(queryKey: readonly unknown[]): ContentLanguage {
  return queryKey[1] === 'en' ? 'en' : 'id';
}

/**
 * keepPreviousData, but only within one language: after a language switch the old catalog must
 * not stand in for the new one.
 */
function sameLangPlaceholder<T>(lang: ContentLanguage) {
  return (prev: T | undefined, prevQuery: { queryKey: readonly unknown[] } | undefined): T | undefined =>
    prevQuery && keyLang(prevQuery.queryKey) === lang ? prev : undefined;
}

/** Flatten infinite pages and drop duplicates (sources sometimes repeat items across pages). */
export function flattenPages(data: InfiniteData<Paged<Drama>> | undefined): Drama[] {
  if (!data) return [];
  const seen = new Set<string>();
  const out: Drama[] = [];
  for (const page of data.pages) {
    for (const d of page.items) {
      const k = `${d.source}:${d.id}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(d);
    }
  }
  return out;
}

export function useHome() {
  const lang = useContentLang();
  return useQuery({
    queryKey: queryKeys.home(lang),
    queryFn: ({ signal, queryKey }) => api.home({ signal, lang: keyLang(queryKey) }),
    staleTime: 5 * MIN,
    gcTime: 30 * MIN,
  });
}

export function useSources() {
  const lang = useContentLang();
  return useQuery({
    queryKey: queryKeys.sources(lang),
    queryFn: ({ signal, queryKey }) => api.sources({ signal, lang: keyLang(queryKey) }),
    staleTime: 5 * MIN,
    select: (r) => r.items,
  });
}

export function useHealth() {
  return useQuery({
    queryKey: queryKeys.health,
    queryFn: ({ signal }) => api.health({ signal }),
    staleTime: 30_000,
    retry: false,
  });
}

/** Vertical "Untukmu" feed. Use `flattenPages(query.data)` for the item list. */
export function useFeed() {
  const lang = useContentLang();
  return useInfiniteQuery({
    queryKey: queryKeys.feed(lang),
    queryFn: ({ pageParam, signal, queryKey }) => api.feed(pageParam, { signal, lang: keyLang(queryKey) }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
    staleTime: 5 * MIN,
  });
}

/** `lang` overrides the content language, e.g. to list in a drama's own language. */
export function useList(source: string | undefined, type: ListType, lang?: ContentLanguage) {
  const appLang = useContentLang();
  const listLang = lang ?? appLang;
  return useInfiniteQuery({
    queryKey: queryKeys.list(source ?? '', type, listLang),
    queryFn: ({ pageParam, signal, queryKey }) => api.list(source!, type, pageParam, { signal, lang: keyLang(queryKey) }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
    enabled: !!source,
    staleTime: 5 * MIN,
    placeholderData: sameLangPlaceholder<InfiniteData<Paged<Drama>, number>>(listLang),
  });
}

/** Caller debounces `q`. Enabled when trimmed q length >= 2. */
export function useSearch(q: string, source?: string) {
  const query = q.trim();
  const enabled = query.length >= 2;
  const lang = useContentLang();
  return useQuery({
    queryKey: queryKeys.search(query, source, lang),
    queryFn: ({ signal, queryKey }) => api.search(query, source, { signal, lang: keyLang(queryKey) }),
    enabled,
    staleTime: 5 * MIN,
    // Keep old results only while typing a new query; a cleared input must show nothing.
    placeholderData: (prev, prevQuery) =>
      enabled && prevQuery && keyLang(prevQuery.queryKey) === lang ? prev : undefined,
    select: (r) => r.items,
  });
}

export function useDetail(source: string | undefined, id: string | undefined) {
  const lang = useContentLang();
  return useQuery({
    queryKey: queryKeys.detail(source ?? '', id ?? '', lang),
    queryFn: ({ signal, queryKey }) => api.detail(source!, id!, { signal, lang: keyLang(queryKey) }),
    enabled: !!source && !!id,
    staleTime: 10 * MIN,
    gcTime: 30 * MIN,
  });
}

/**
 * Entries whose stream URL pointed at another origin than the server we talk to, keyed by
 * `${query key}|${current base URL}`: the `dataUpdatedAt` of the entry found stale. Each key is
 * refetched at most once, and data fetched after that is trusted, so a server that legitimately hands
 * out another origin (http vs https behind a proxy, an alias host) can't cause a refetch loop.
 */
const staleSeenAt = new Map<string, number>();

export function useEpisode(source: string | undefined, id: string | undefined, ep: number | undefined) {
  const qc = useQueryClient();
  const lang = useContentLang();
  const key = queryKeys.episode(source ?? '', id ?? '', ep ?? 0, lang);
  const enabled = !!source && !!id && !!ep && ep > 0;
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal, queryKey }) => api.episode(source!, id!, ep!, { signal, lang: keyLang(queryKey) }),
    enabled,
    // Never refetch in the background: each fetch returns a newly signed URL, and a new URL
    // swaps the source under the player (stream restarts). Retry/refetch only when asked.
    staleTime: Infinity,
    gcTime: EPISODE_GC_MS,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    // A cached/prefetched URL on a dead server origin must not reach the player: hide it until the
    // refetch below has replaced it.
    select: (d): EpisodePlay | undefined => {
      if (!isStaleStreamUrl(d.url)) return d;
      const seen = staleSeenAt.get(`${JSON.stringify(key)}|${getBaseUrl()}`);
      return seen !== undefined && (qc.getQueryState(key)?.dataUpdatedAt ?? 0) > seen ? d : undefined;
    },
  });

  // Found a stale origin in the cache (e.g. prefetched before the server restarted): refetch once.
  const updatedAt = query.dataUpdatedAt;
  useEffect(() => {
    if (!enabled) return;
    const state = qc.getQueryState<EpisodePlay>(queryKeys.episode(source!, id!, ep!, lang));
    const url = state?.data?.url;
    if (!url || !isStaleStreamUrl(url)) return;
    const seenKey = `${JSON.stringify(queryKeys.episode(source!, id!, ep!, lang))}|${getBaseUrl()}`;
    if (staleSeenAt.has(seenKey)) return;
    staleSeenAt.set(seenKey, state.dataUpdatedAt);
    void qc.refetchQueries({ queryKey: queryKeys.episode(source!, id!, ep!, lang), exact: true });
  }, [qc, enabled, source, id, ep, lang, updatedAt]);

  // A reset (server address changed) can leave an observed query pending but idle: kick it again.
  const stuck = enabled && query.isPending && query.fetchStatus === 'idle';
  const { refetch } = query;
  useEffect(() => {
    if (stuck) void refetch();
  }, [stuck, refetch]);

  return query;
}

/** Returns a stable function that warms the cache for an episode (e.g. next episode). */
export function usePrefetchEpisode() {
  const qc = useQueryClient();
  return useCallback(
    (source: string, id: string, ep: number) => {
      const lang = useSettings.getState().contentLang;
      return qc.prefetchQuery({
        queryKey: queryKeys.episode(source, id, ep, lang),
        queryFn: ({ signal }) => api.episode(source, id, ep, { signal, lang }),
        staleTime: 60_000,
        gcTime: EPISODE_GC_MS,
      });
    },
    [qc],
  );
}

/** Returns a stable function that warms the detail cache (e.g. on card press-in). */
export function usePrefetchDetail() {
  const qc = useQueryClient();
  return useCallback(
    (source: string, id: string) => {
      const lang = useSettings.getState().contentLang;
      return qc.prefetchQuery({
        queryKey: queryKeys.detail(source, id, lang),
        queryFn: ({ signal }) => api.detail(source, id, { signal, lang }),
        staleTime: 10 * MIN,
      });
    },
    [qc],
  );
}
