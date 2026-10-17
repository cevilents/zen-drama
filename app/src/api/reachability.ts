import { onlineManager } from '@tanstack/react-query';
import { Platform } from 'react-native';

import { getBaseUrl } from './client';

const PROBE_TIMEOUT_MS = 5000;
/** While marked offline, how often the server is probed for a way back. */
const POLL_MS = 5000;
/** Give up polling after this long (a server that stays down); the next network failure starts it again. */
const POLL_MAX_MS = 10 * 60_000;

let lastFailureAt = 0;
let pollTimer: ReturnType<typeof setInterval> | null = null;

/** One short GET /api/health against the current server. True on a 2xx; never throws. */
export async function probeServerReachable(): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(`${getBaseUrl()}/api/health`, {
      signal: controller.signal,
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) lastFailureAt = Date.now();
    return res.ok;
  } catch {
    lastFailureAt = Date.now();
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** True when a network failure or failed probe was seen at or after `ts` (ms epoch). */
export function failedSince(ts: number): boolean {
  return lastFailureAt >= ts;
}

function stopPoll() {
  if (!pollTimer) return;
  clearInterval(pollTimer);
  pollTimer = null;
}

/**
 * A request failed as unreachable / tunnel-down: mark React Query offline and probe until the server
 * answers, then mark it online again so stale queries refetch (refetchOnReconnect). No NetInfo needed.
 * Idempotent: one poll at a time, and none at all while the server is healthy.
 */
export function noteNetworkFailure() {
  lastFailureAt = Date.now();
  // Browsers report online/offline themselves.
  if (Platform.OS === 'web') return;
  onlineManager.setOnline(false);
  if (pollTimer) return;
  const startedAt = Date.now();
  let checking = false;
  pollTimer = setInterval(async () => {
    if (checking) return;
    if (Date.now() - startedAt > POLL_MAX_MS) {
      stopPoll();
      return;
    }
    checking = true;
    const ok = await probeServerReachable();
    checking = false;
    if (!ok || !pollTimer) return;
    stopPoll();
    onlineManager.setOnline(true);
  }, POLL_MS);
}
