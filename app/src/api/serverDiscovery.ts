import Constants from 'expo-constants';
import { AppState, Platform } from 'react-native';

import { useSettings } from '@/store/useSettings';

/** Fixed "pointer" that publishes the server's current (changing) public address. */
export const SERVER_POINTER_URL =
  process.env.EXPO_PUBLIC_SERVER_POINTER_URL ?? 'https://zen-drama.zen-drama.workers.dev/server.json';

const LOOKUP_TIMEOUT_MS = 6000;
/** A dead server must not turn every failed request into a pointer lookup. */
const LOOKUP_MIN_INTERVAL_MS = 15_000;

/** Tunnel hosts (`expo start --tunnel`, ngrok, …) proxy Metro only — the API isn't reachable there. */
const TUNNEL_HOST_RE = /\.(exp\.direct|ngrok\.io|ngrok-free\.app|ngrok\.app|ngrok-free\.dev|trycloudflare\.com|loca\.lt)$/i;

function getDevHostUri(): string | undefined {
  return (
    Constants.expoConfig?.hostUri ??
    // Older manifests expose it here.
    (Constants as unknown as { manifest2?: { extra?: { expoGo?: { debuggerHost?: string } } } })
      .manifest2?.extra?.expoGo?.debuggerHost
  );
}

/**
 * Host part of a Metro hostUri: "192.168.1.10:8081" -> "192.168.1.10",
 * "[fe80::1]:8081" -> "[fe80::1]" (brackets kept so it can go straight into a URL).
 */
function hostFromHostUri(hostUri: string): string | null {
  const authority = hostUri.trim().replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').split('/')[0];
  if (authority.startsWith('[')) {
    const end = authority.indexOf(']');
    if (end < 0) return null;
    // A zone id ("%en0") must be percent-encoded inside a URL.
    return authority.slice(0, end + 1).replace(/%(?!25)/g, '%25');
  }
  // Unbracketed IPv6 can't be split from its port reliably.
  if ((authority.match(/:/g) ?? []).length > 1) return null;
  return authority.split(':')[0] || null;
}

/** Dev machine's LAN host when running under Expo Go / a dev client, else null. */
export function getDevLanHost(): string | null {
  const hostUri = getDevHostUri();
  const host = hostUri ? hostFromHostUri(hostUri) : null;
  return host && !TUNNEL_HOST_RE.test(host) ? host : null;
}

const LOCAL_WEB_HOST_RE =
  /^(localhost|127\.\d+\.\d+\.\d+|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/i;

/** `expo start --web` served from this machine or its LAN: the API runs next to it on :3030. */
function isLocalDevWeb(): boolean {
  if (!__DEV__ || Platform.OS !== 'web' || typeof window === 'undefined') return false;
  const host = window.location?.hostname;
  return !!host && LOCAL_WEB_HOST_RE.test(host);
}

/**
 * Whether the pointer is consulted. Off when the build pins EXPO_PUBLIC_API_URL, and in dev
 * when the API runs on the dev machine (LAN host of `npx expo start`, or web served locally).
 */
export function isDiscoveryActive(): boolean {
  if (process.env.EXPO_PUBLIC_API_URL) return false;
  if (__DEV__ && Platform.OS !== 'web' && getDevLanHost()) return false;
  if (isLocalDevWeb()) return false;
  return true;
}

/** Accepts only an absolute https URL; returns it without a trailing slash. */
function parseDiscoveredUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const u = new URL(value.trim());
    if (u.protocol !== 'https:' || !u.hostname || u.username || u.password) return null;
    return u.href.replace(/[?#].*$/, '').replace(/\/+$/, '');
  } catch {
    return null;
  }
}

let inFlight: Promise<boolean> | null = null;
let lastAttemptAt = 0;

/**
 * Looks up the current server address and stores it when valid. Resolves true when the stored
 * address changed. Throttled, de-duplicated and never rejects. `force` skips the throttle for an
 * explicit recovery (a stream that died, a user retry); concurrent lookups are still shared.
 */
export function refreshDiscoveredServer({ force = false }: { force?: boolean } = {}): Promise<boolean> {
  if (!isDiscoveryActive()) return Promise.resolve(false);
  if (inFlight) return inFlight;
  if (!force && Date.now() - lastAttemptAt < LOOKUP_MIN_INTERVAL_MS) return Promise.resolve(false);
  lastAttemptAt = Date.now();

  inFlight = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
    try {
      const res = await fetch(SERVER_POINTER_URL, {
        signal: controller.signal,
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) return false;
      const body: unknown = await res.json();
      const url = parseDiscoveredUrl(body && typeof body === 'object' ? (body as { url?: unknown }).url : null);
      if (!url || url === useSettings.getState().discoveredServerUrl) return false;
      useSettings.getState().setDiscoveredServerUrl(url);
      return true;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
      inFlight = null;
    }
  })();
  return inFlight;
}

/** Startup lookup plus a re-check whenever the app returns to the foreground (native). Call after hydration. */
export function startServerDiscovery(): () => void {
  void refreshDiscoveredServer();

  // The store hydrates late when AsyncStorage is slow (the layout proceeds after a timeout): the persisted,
  // older address would then overwrite a fresh lookup, so look up once more when it lands.
  let unsubHydration = () => {};
  if (!useSettings.persist.hasHydrated()) {
    unsubHydration = useSettings.persist.onFinishHydration(() => {
      unsubHydration();
      lastAttemptAt = 0;
      void refreshDiscoveredServer();
    });
  }

  if (Platform.OS === 'web') return unsubHydration;
  const sub = AppState.addEventListener('change', (state) => {
    if (state === 'active') void refreshDiscoveredServer();
  });
  return () => {
    unsubHydration();
    sub.remove();
  };
}
