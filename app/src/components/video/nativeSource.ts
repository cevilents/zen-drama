import type { VideoSource } from 'expo-video';
import { Platform } from 'react-native';

import type { VideoSourceInput } from './VideoSurface.types';

/**
 * Temporary kill switch while diagnosing an Android playback-stall buildup (next episode stuck loading
 * after a couple of transitions). Off = no next-episode preloading and no disk caching, i.e. one player
 * per episode and plain streaming. Flip back to true to re-enable once the leak is understood/fixed.
 */
export const NATIVE_PREFETCH_ENABLED = false;

/**
 * expo-video's disk cache is only used on Android (iOS's caching loader rejects the proxy's MIME types
 * and can't serve HLS at all), and only while the prefetch feature is enabled.
 */
export const canCache = Platform.OS === 'android' && NATIVE_PREFETCH_ENABLED;

/**
 * The source object both the player surface and the preloader hand to expo-video, so the two request
 * byte-identical URLs and share cache entries (the cache key is the URL). `cache` false forces a
 * network load: a retry must not be served the same (possibly dead) cached playlist again.
 */
export function toPlayerSource({ uri, type }: VideoSourceInput, cache = true): VideoSource {
  return { uri, contentType: type === 'hls' ? 'hls' : 'progressive', useCaching: canCache && cache };
}
