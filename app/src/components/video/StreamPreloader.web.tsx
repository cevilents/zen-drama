import type { StreamPreloaderProps } from './VideoSurface.types';

/** Web has no disk-cached preload path (hls.js / <video> manage their own buffering). */
export function StreamPreloader(_props: StreamPreloaderProps) {
  return null;
}
