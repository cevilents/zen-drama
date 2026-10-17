import { useVideoPlayer } from 'expo-video';
import { useEffect } from 'react';

import { canCache, toPlayerSource } from './nativeSource';
import type { StreamPreloaderProps } from './VideoSurface.types';

/** How much of the next episode to pull; the playback request after it continues from the network. */
const PRELOAD_SECONDS = 15;
/** Give up waiting for the buffer to fill (slow link) and release anyway. */
const PRELOAD_MAX_MS = 30_000;
const POLL_MS = 1000;

/**
 * Warms the next stream: a muted, never-played player with no view fills its buffer, which writes the
 * first seconds to expo-video's disk cache; the next VideoSurface reads them when it requests the same
 * URL. Once buffered the source is closed so the cache commits the bytes (an open range stays pending)
 * and the decoder and connection are freed. Renders nothing; unmounting releases the player.
 */
export function StreamPreloader({ source }: StreamPreloaderProps) {
  const player = useVideoPlayer(null, (p) => {
    p.muted = true;
    p.bufferOptions = { preferredForwardBufferDuration: PRELOAD_SECONDS };
  });

  const uri = source?.uri ?? null;
  const type = source?.type ?? null;

  useEffect(() => {
    // Nothing to fetch, or it couldn't be cached (the bytes would die with the player).
    if (!uri || !type || !canCache) {
      player.replaceAsync(null).catch(() => {});
      return;
    }
    let timer: ReturnType<typeof setInterval> | undefined;
    const startedAt = Date.now();
    const done = () => {
      clearInterval(timer);
      player.replaceAsync(null).catch(() => {});
    };
    player
      .replaceAsync(toPlayerSource({ uri, type }))
      .then(() => {
        timer = setInterval(() => {
          try {
            if (player.bufferedPosition >= PRELOAD_SECONDS - 1 || Date.now() - startedAt >= PRELOAD_MAX_MS) done();
          } catch {
            clearInterval(timer);
          }
        }, POLL_MS);
      })
      .catch(() => {});
    return () => clearInterval(timer);
  }, [player, uri, type]);

  return null;
}
