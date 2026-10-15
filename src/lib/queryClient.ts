import { onlineManager, QueryClient, type Query } from '@tanstack/react-query';
import { Platform } from 'react-native';

import { getBaseUrl, isApiError, isDirectStreamUrl } from '@/api/client';
import { useSettings } from '@/store/useSettings';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2 * 60_000,
      gcTime: 10 * 60_000,
      // client.ts already retries network/timeout failures once at the fetch level; retrying
      // those again here only multiplies the wait. One extra retry for flaky 5xx upstreams.
      retry: (failureCount, error) => {
        if (isApiError(error)) {
          if (error.kind === 'network' || error.kind === 'timeout' || error.kind === 'aborted') return false;
          if (error.kind === 'http' && (error.status ?? 0) < 500) return false;
        }
        return failureCount < 1;
      },
      retryDelay: (attempt) => Math.min(800 * 2 ** attempt, 4000),
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      // onlineManager is flipped by our own reachability probe (see api/reachability.ts), not NetInfo: while
      // "offline" queries must still run and fail normally (error cards, retry buttons) instead of pausing.
      networkMode: 'always',
    },
  },
});

// No focus wiring: refetchOnWindowFocus is off app-wide (a refetch would re-sign episode URLs
// and restart playback). No NetInfo in Expo Go by default — assume online; apiGet flips onlineManager
// offline on unreachable/tunnel-down failures and a probe flips it back (reconnect refetch).
if (Platform.OS !== 'web') {
  onlineManager.setOnline(true);
}

/** An episode whose stream is a direct CDN URL: it keeps playing across a server address change. */
function hasDirectStream(query: Query): boolean {
  if (query.queryKey[0] !== 'episode') return false;
  const url = (query.state.data as { url?: unknown } | undefined)?.url;
  return typeof url === 'string' && url !== '' && isDirectStreamUrl(url);
}

// When the effective server changes (user override or a newly discovered address), drop everything
// cached from the old one; active queries refetch against the new address. Episodes playing a direct CDN
// URL are kept (resetting would tear down a healthy stream) and only refreshed in the background, so their
// subtitle URLs, which are always proxied, move to the new address.
let lastBaseUrl = getBaseUrl();
useSettings.subscribe(() => {
  const base = getBaseUrl();
  if (base !== lastBaseUrl) {
    lastBaseUrl = base;
    void queryClient.invalidateQueries({ predicate: hasDirectStream, refetchType: 'active' });
    void queryClient.resetQueries({ predicate: (q) => !hasDirectStream(q) });
  }
});
