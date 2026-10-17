import { setVideoCacheSizeAsync } from 'expo-video';

import { canCache } from './nativeSource';

const VIDEO_CACHE_BYTES = 300 * 1024 * 1024;

/**
 * Caps expo-video's persistent disk cache (default 1 GB). It throws while any player exists, so call it
 * once at startup before a screen can mount one.
 */
export function limitVideoCache() {
  if (!canCache) return;
  try {
    setVideoCacheSizeAsync(VIDEO_CACHE_BYTES).catch(() => {});
  } catch {
    // Players already registered or module unavailable: keep the default size.
  }
}
