import { useQuery } from '@tanstack/react-query';
import { useEffect, useState, type RefObject } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { cueTextAt, parseVtt, type Cue } from '@/lib/vtt';
import { colors, radii, spacing } from '@/theme';

import { playerLayout } from './playerLayout';

/** How often the overlay re-reads the playback clock. */
const POLL_MS = 100;
/** Never run ahead of the last reported position by more than this (an unreported stall). */
const MAX_EXTRAPOLATE_SEC = 1;

/**
 * Playback position as last reported by the player's progress events (every ~0.25 s), plus what is
 * needed to extrapolate between reports. Read on a timer instead of asking the player, because
 * reading expo-video's currentTime blocks on the Android main thread.
 */
export interface PlaybackClock {
  /** Seconds at `at`. */
  pos: number;
  /** Date.now() when `pos` was taken. */
  at: number;
  rate: number;
  /** Frames are actually advancing (playing and not buffering). */
  playing: boolean;
}

export function createClock(pos = 0): PlaybackClock {
  return { pos, at: Date.now(), rate: 1, playing: false };
}

/** Estimated position now. */
export function clockTime(c: PlaybackClock, now = Date.now()): number {
  if (!c.playing) return c.pos;
  return c.pos + Math.min(Math.max(0, (now - c.at) / 1000), MAX_EXTRAPOLATE_SEC) * c.rate;
}

/** Updates the clock in place. Without `pos`, the current estimate is kept so rate/state changes don't jump. */
export function updateClock(c: PlaybackClock, next: Partial<Omit<PlaybackClock, 'at'>>): void {
  const now = Date.now();
  if (next.pos === undefined) c.pos = clockTime(c, now);
  Object.assign(c, next);
  c.at = now;
}

export interface SubtitleOverlayProps {
  /** WebVTT URL of the selected track (proxy URL from /api/episode). */
  url: string;
  /** Playback clock, kept current by the player's progress events. */
  clock: RefObject<PlaybackClock>;
  /** Distance from the bottom of the stage, clear of the player controls. */
  bottom: number;
  /** Right edge inset; defaults to the page gutter. */
  right?: number;
}

async function fetchCues(url: string, signal: AbortSignal): Promise<Cue[]> {
  const res = await fetch(url, { signal, headers: { Accept: 'text/vtt, text/plain;q=0.9, */*;q=0.5' } });
  if (!res.ok) throw new Error(`Subtitle HTTP ${res.status}`);
  return parseVtt(await res.text());
}

/**
 * Renders the active WebVTT cue over the video (expo-video can't side-load VTT on native, so both
 * platforms draw it here). Fails silently: a track that can't be fetched or parsed shows nothing.
 * Never takes touches.
 */
export function SubtitleOverlay({ url, clock, bottom, right = playerLayout.gutter }: SubtitleOverlayProps) {
  const { data: cues } = useQuery({
    queryKey: ['subtitle', url],
    queryFn: ({ signal }) => fetchCues(url, signal),
    staleTime: Infinity,
    gcTime: 10 * 60_000,
  });
  const [text, setText] = useState('');

  useEffect(() => {
    if (!cues?.length) return;
    const tick = () => setText(cueTextAt(cues, clockTime(clock.current)));
    tick();
    const timer = setInterval(tick, POLL_MS);
    return () => clearInterval(timer);
  }, [cues, clock]);

  if (!cues?.length || !text) return null;

  return (
    <View pointerEvents="none" style={[styles.root, { bottom, right }]}>
      <View style={styles.box}>
        <AppText variant="bodyMedium" weight="semibold" align="center" color={colors.white} style={styles.text}>
          {text}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', left: playerLayout.gutter, alignItems: 'center' },
  box: {
    maxWidth: '100%',
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[0.5],
    borderRadius: radii.xs,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  text: {
    fontSize: 16,
    lineHeight: 22,
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowRadius: 4,
    textShadowOffset: { width: 0, height: 1 },
  },
});
