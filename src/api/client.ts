import { Platform } from 'react-native';

import { useSettings } from '@/store/useSettings';

import { noteNetworkFailure } from './reachability';
import { getDevLanHost, isDiscoveryActive, refreshDiscoveredServer } from './serverDiscovery';
import type {
  ContentLanguage,
  DramaDetail,
  EpisodePlay,
  HealthResponse,
  HomeResponse,
  ListType,
  Paged,
  Drama,
  SearchResponse,
  SourcesResponse,
} from './types';

const API_PORT = 3030;
const DEFAULT_TIMEOUT_MS = 30_000;
const RETRY_DELAY_MS = 600;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export type ApiErrorKind =
  /** Server could not be reached at all (wrong IP, server down, different Wi-Fi). */
  | 'network'
  /** Request exceeded the timeout. */
  | 'timeout'
  /** Server replied with 4xx/5xx. */
  | 'http'
  /** Response body was not valid JSON. */
  | 'parse'
  /** Aborted by the caller (React Query cancellation). */
  | 'aborted';

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status?: number;
  readonly url: string;

  constructor(kind: ApiErrorKind, message: string, url: string, status?: number) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
    this.url = url;
  }

  /** True when the app most likely cannot talk to the server at all (timeouts are a slow server, not this). */
  get isUnreachable(): boolean {
    return this.kind === 'network';
  }
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}

/** True for errors that indicate the server is unreachable (vs. a server-side failure). */
export function isUnreachableError(e: unknown): boolean {
  return isApiError(e) && e.isUnreachable;
}

/** Statuses a dead Cloudflare quick tunnel answers with from the edge (530/error 1033, bad gateway, …). */
const TUNNEL_DOWN_STATUSES = [502, 503, 504, 530];

function isTunnelDownError(e: unknown): boolean {
  return isApiError(e) && e.kind === 'http' && TUNNEL_DOWN_STATUSES.includes(e.status ?? 0);
}

// ---------------------------------------------------------------------------
// Base URL resolution
// ---------------------------------------------------------------------------

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

function normalizeServerUrl(input: string): string {
  let url = input.trim();
  if (!/^https?:\/\//i.test(url)) url = `http://${url}`;
  return stripTrailingSlash(url);
}

/** URL derived from the environment, ignoring the user override. */
export function getDefaultBaseUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  if (envUrl) return normalizeServerUrl(envUrl);

  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.hostname) {
    const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
    return `${protocol}//${window.location.hostname}:${API_PORT}`;
  }

  // Expo Go / dev client: the dev machine's LAN IP.
  const host = getDevLanHost();
  if (host) return `http://${host}:${API_PORT}`;

  return `http://localhost:${API_PORT}`;
}

/** Effective base URL: settings override > discovered (only when discovery is active, i.e. no env URL) > env/derived. */
export function getBaseUrl(): string {
  const { serverUrl: override, discoveredServerUrl: discovered } = useSettings.getState();
  if (override && override.trim()) return normalizeServerUrl(override);
  if (discovered && isDiscoveryActive()) return stripTrailingSlash(discovered);
  return getDefaultBaseUrl();
}

function originOf(url: string): string | null {
  const m = /^(https?:\/\/[^/?#]+)/i.exec(url);
  return m ? m[1].toLowerCase() : null;
}

/** A CDN URL the server returned as is (anything but our signed /api/proxy): independent of the server's address. */
export function isDirectStreamUrl(url: string): boolean {
  return !url.includes('/api/proxy?');
}

/**
 * True when an absolute stream URL points at a server origin other than the one the app talks to now,
 * i.e. it was signed before the tunnel moved and the player would hang on a dead host. Only meaningful
 * while the origin is driven by discovery; a pinned/overridden server never moves, so never stale there.
 * Direct CDN URLs (anything that is not our signed /api/proxy) don't depend on the tunnel, so never stale.
 */
export function isStaleStreamUrl(url: string): boolean {
  if (useSettings.getState().serverUrl?.trim() || !isDiscoveryActive()) return false;
  if (isDirectStreamUrl(url)) return false;
  const origin = originOf(url);
  return !!origin && origin !== originOf(getBaseUrl());
}

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

type Query = Record<string, string | number | boolean | undefined | null>;

export interface RequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Number of retries on network/timeout/5xx. Default 1. */
  retries?: number;
  /** Content language sent as `lang`; pass the one in the query key. Default: current setting. */
  lang?: ContentLanguage;
}

function buildUrl(path: string, query?: Query): string {
  const base = getBaseUrl();
  const qs = query
    ? Object.entries(query)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&')
    : '';
  return `${base}${path}${qs ? `?${qs}` : ''}`;
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new ApiError('aborted', 'Permintaan dibatalkan', ''));
      return;
    }
    const onAbort = () => {
      clearTimeout(t);
      reject(new ApiError('aborted', 'Permintaan dibatalkan', ''));
    };
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

async function fetchOnce<T>(url: string, signal: AbortSignal | undefined, timeoutMs: number): Promise<T> {
  if (signal?.aborted) throw new ApiError('aborted', 'Permintaan dibatalkan', url);

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });

  // Same mapping for the request and the body read: the timeout/abort cover both.
  const toApiError = (fallback: ApiError): ApiError => {
    if (signal?.aborted) return new ApiError('aborted', 'Permintaan dibatalkan', url);
    if (timedOut) return new ApiError('timeout', 'Server terlalu lama merespons', url);
    return fallback;
  };

  let res: Response;
  let text: string;
  try {
    try {
      res = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
    } catch {
      throw toApiError(new ApiError('network', 'Tidak dapat terhubung ke server', url));
    }
    try {
      text = await res.text();
    } catch {
      // Connection dropped mid-body: treat like a network failure (retryable).
      throw toApiError(new ApiError('network', 'Koneksi terputus saat menerima data', url, res.status));
    }
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }

  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      if (res.ok) throw new ApiError('parse', 'Respons server tidak valid', url, res.status);
    }
  }

  if (!res.ok) {
    const msg =
      body && typeof body === 'object' && 'error' in body && typeof (body as { error: unknown }).error === 'string'
        ? (body as { error: string }).error
        : `Server error (${res.status})`;
    throw new ApiError('http', msg, url, res.status);
  }
  return body as T;
}

function shouldRetry(e: unknown): boolean {
  if (!isApiError(e)) return false;
  if (e.kind === 'aborted' || e.kind === 'parse') return false;
  if (e.kind === 'http') return (e.status ?? 0) >= 500;
  return true;
}

/** Routes that take no `lang` (docs/LANG_CONTRACT.md); proxy URLs never go through apiGet. */
const LANGLESS_PATHS = ['/api/health'];

export async function apiGet<T>(path: string, query?: Query, opts: RequestOptions = {}): Promise<T> {
  const { signal, timeoutMs = DEFAULT_TIMEOUT_MS, retries = 1 } = opts;
  const lang = LANGLESS_PATHS.includes(path) ? undefined : (opts.lang ?? useSettings.getState().contentLang);
  const url = buildUrl(path, { ...query, lang });
  let attempt = 0;
  for (;;) {
    try {
      return await fetchOnce<T>(url, signal, timeoutMs);
    } catch (e) {
      // The tunnel address changes on restart: re-read the pointer. A new address resets the queries.
      // A dead quick tunnel often answers 502/503/504/530 from Cloudflare's edge instead of failing to connect.
      if (isUnreachableError(e) || isTunnelDownError(e)) {
        void refreshDiscoveredServer();
        // React Query goes offline until /api/health answers again, then refetches on reconnect.
        noteNetworkFailure();
      }
      if (attempt >= retries || !shouldRetry(e) || signal?.aborted) throw e;
      attempt += 1;
      await delay(RETRY_DELAY_MS * attempt, signal);
    }
  }
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

export const api = {
  health: (o?: RequestOptions) => apiGet<HealthResponse>('/api/health', undefined, { timeoutMs: 5000, retries: 0, ...o }),
  sources: (o?: RequestOptions) => apiGet<SourcesResponse>('/api/sources', undefined, o),
  // Home fans out to every source server-side, so it gets more headroom than the default.
  home: (o?: RequestOptions) => apiGet<HomeResponse>('/api/home', undefined, { timeoutMs: 45_000, ...o }),
  list: (source: string, type: ListType, page = 1, o?: RequestOptions) =>
    apiGet<Paged<Drama>>('/api/list', { source, type, page }, o),
  feed: (page = 1, o?: RequestOptions) => apiGet<Paged<Drama>>('/api/feed', { page }, o),
  search: (q: string, source?: string, o?: RequestOptions) =>
    apiGet<SearchResponse>('/api/search', { q, source }, o),
  detail: (source: string, id: string, o?: RequestOptions) =>
    apiGet<DramaDetail>('/api/detail', { source, id }, o),
  episode: (source: string, id: string, ep: number, o?: RequestOptions) =>
    apiGet<EpisodePlay>('/api/episode', { source, id, ep }, o),
};
