import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { isStaleStreamUrl } from '@/api/client';
import { failedSince, probeServerReachable } from '@/api/reachability';
import { refreshDiscoveredServer } from '@/api/serverDiscovery';
import { useAppActive } from '@/components/feed/useAppActive';

/** How often a continuous stall is re-checked against the server pointer. */
const STALL_CHECK_MS = 12_000;
/** How often a continuous stall probes whether the server is reachable (the pointer check runs every other tick). */
const STALL_PROBE_MS = 6_000;
/** How often the error card probes for the server coming back. */
const ERROR_PROBE_MS = 8_000;
/** The error-card probe backs off up to this interval, and stops polling after the cap below. */
const ERROR_PROBE_MAX_MS = 30_000;
const ERROR_PROBE_CAP_MS = 10 * 60_000;
/** A stall this long (continuous) with no way to recover is reported as an error instead of spinning. */
const STALL_GIVE_UP_MS = 40_000;
/** Seconds of playback after a recovery before another automatic recovery is allowed. */
const HEALTHY_SECONDS = 3;

interface Options {
  /** Refetch the episode (a fresh, newly signed stream URL). */
  refetch: () => Promise<unknown>;
  /** URL currently handed to the player, null when idle. */
  uri: string | null;
  /** Buffering although playback is wanted and a stream is loaded. */
  stalled: boolean;
  /** The error card is showing for this (active) episode: probe for the server and retry on its own. */
  errored: boolean;
  /** Automatic recovery is starting: reset the player state (runs before the refresh). */
  onRecover: () => void;
  /** Recovery is spent (or the stall never cleared): show the error instead. */
  onGiveUp: (message: string) => void;
}

/**
 * Automatic recovery for streams that die inside the player (the quick tunnel moves on a server
 * restart; the native player just retries forever and apiGet never sees it): re-read the server
 * address, then refetch the episode for a URL on the live origin. One attempt per failure; it is
 * re-armed once playback has run healthily again. A repeat failure surfaces as an error.
 *
 * A slow-but-alive stream is left alone: a stall only triggers recovery when the address actually
 * changed and the stream is proxied, the proxied URL is on an old origin, or the server was seen
 * unreachable during the stall and answers again (a network drop); otherwise it ends in an error
 * after a long stall window. Direct CDN URLs don't depend on the server's address, so a moved address
 * never counts against them. While the error card
 * shows, the server is probed and the card retries itself once it is back. Probing only runs in those
 * failed states and stops as soon as playback is healthy.
 */
export function useStreamRecovery({ refetch, uri, stalled, errored, onRecover, onGiveUp }: Options) {
  const spent = useRef(false);
  const inProgress = useRef(false);
  const unmounted = useRef(false);
  const baseline = useRef<number | null>(null);
  /** The server failed a probe since the current failure began; the next success means it came back. */
  const downSeen = useRef(false);
  /** An automatic reachability/foreground recovery already ran since playback was last healthy. */
  const autoTried = useRef(false);
  const appActive = useAppActive();
  const wasAppActive = useRef(appActive);
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    unmounted.current = false;
    return () => {
      unmounted.current = true;
    };
  }, []);

  /** Refresh the address (bypassing the throttle) and refetch. Also backs the manual "Coba lagi". */
  const refresh = useCallback(async () => {
    inProgress.current = true;
    setRecovering(true);
    try {
      await refreshDiscoveredServer({ force: true });
      if (!unmounted.current) await refetch();
    } finally {
      inProgress.current = false;
      if (!unmounted.current) setRecovering(false);
    }
  }, [refetch]);

  /** A real player error: recover once, then report. Ignored while a recovery is already running. */
  const fail = (message: string) => {
    if (inProgress.current) return;
    if (spent.current) {
      onGiveUp(message);
      return;
    }
    spent.current = true;
    baseline.current = null;
    onRecover();
    void refresh();
  };

  /** Same as the manual "Coba lagi": reset the player, re-discover the server, refetch. Re-armed by healthy playback. */
  const recoverNow = () => {
    if (inProgress.current) return;
    spent.current = true;
    autoTried.current = true;
    downSeen.current = false;
    baseline.current = null;
    onRecover();
    void refresh();
  };

  /** Feed playback position; sustained progress after a recovery re-arms the automatic attempt. */
  const reportProgress = (pos: number) => {
    if (!spent.current || inProgress.current) return;
    if (baseline.current === null || pos < baseline.current) baseline.current = pos;
    else if (pos - baseline.current >= HEALTHY_SECONDS) {
      spent.current = false;
      autoTried.current = false;
      downSeen.current = false;
      baseline.current = null;
    }
  };

  // Called after a pointer lookup / reachability probe during a stall. Returns true to keep waiting.
  const onStallChecked = useEffectEvent((changed: boolean, reachable: boolean, since: number): boolean => {
    if (inProgress.current) return false;
    // A moved server address only strands streams served through our proxy, not direct CDN URLs.
    const proxied = !!uri && uri.includes('/api/proxy?');
    if ((changed && proxied) || (!!uri && isStaleStreamUrl(uri))) {
      fail('Video tidak kunjung dimuat');
      return false;
    }
    // Reachable again after being seen down during this stall: the player's retries died with the connection.
    // A server that was never down is just slow or buffering: leave the stream alone.
    if (!reachable) downSeen.current = true;
    else if (downSeen.current || failedSince(since)) {
      recoverNow();
      return false;
    }
    if (Date.now() - since >= STALL_GIVE_UP_MS) {
      onGiveUp('Video tidak kunjung dimuat');
      return false;
    }
    return true;
  });
  useEffect(() => {
    if (!stalled || recovering) return;
    downSeen.current = false;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const since = Date.now();
    let lastLookup = since;
    const check = async () => {
      const lookupDue = Date.now() - lastLookup >= STALL_CHECK_MS - STALL_PROBE_MS / 2;
      if (lookupDue) lastLookup = Date.now();
      const [changed, reachable] = await Promise.all([
        lookupDue ? refreshDiscoveredServer({ force: true }) : Promise.resolve(false),
        probeServerReachable(),
      ]);
      if (cancelled) return;
      if (onStallChecked(changed, reachable, since)) timer = setTimeout(check, STALL_PROBE_MS);
    };
    timer = setTimeout(check, STALL_PROBE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [stalled, recovering]);

  // Error card up: retry by itself once the server answers again (after it was seen down, or once for a
  // stuck player when it never looked down), instead of waiting for a tap.
  const onErrorProbed = useEffectEvent((reachable: boolean): boolean => {
    if (inProgress.current) return false;
    if (!reachable) {
      downSeen.current = true;
      return true;
    }
    if (downSeen.current || !autoTried.current) {
      recoverNow();
      return false;
    }
    return true;
  });
  useEffect(() => {
    // Only probe while the user is actually looking (foreground): a backgrounded error card must not
    // poll the server. Returning to the foreground re-fires recoverNow via onForeground below.
    if (!errored || recovering || !appActive) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const since = Date.now();
    let wait = ERROR_PROBE_MS;
    const check = async () => {
      const reachable = await probeServerReachable();
      if (cancelled || !onErrorProbed(reachable)) return;
      // Back off and stop after a while, so a long outage left on screen isn't a steady drip of requests.
      if (Date.now() - since >= ERROR_PROBE_CAP_MS) return;
      wait = Math.min(Math.round(wait * 1.5), ERROR_PROBE_MAX_MS);
      timer = setTimeout(check, wait);
    };
    timer = setTimeout(check, wait);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [errored, recovering, appActive]);

  // Back to the foreground (native) while stalled or on the error card: the connection likely died meanwhile.
  const onForeground = useEffectEvent(() => {
    if (Platform.OS !== 'web' && (stalled || errored)) recoverNow();
  });
  useEffect(() => {
    if (appActive && !wasAppActive.current) onForeground();
    wasAppActive.current = appActive;
  }, [appActive]);

  return { recovering, refresh, fail, reportProgress };
}
