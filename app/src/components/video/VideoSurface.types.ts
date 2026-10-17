import type { Ref } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

import type { StreamType } from '@/api/types';

export interface VideoSourceInput {
  uri: string;
  type: StreamType; // 'hls' | 'mp4'
}

export interface VideoSurfaceError {
  message: string;
  /** Web only: the browser blocked autoplay with sound. */
  autoplayBlocked?: boolean;
}

export interface StreamPreloaderProps {
  /** Stream to warm up for a later VideoSurface; null = nothing. */
  source: VideoSourceInput | null;
}

export interface VideoSurfaceProps {
  /**
   * Imperative handle (seek, position). Passed as a plain prop (React 19) rather than via
   * forwardRef: React 19.2 never refreshes `useEffectEvent` callbacks inside forwardRef
   * components, which froze the surface's event handlers at their first render.
   */
  ref?: Ref<VideoSurfaceHandle>;
  /** null = idle (shows poster / black). Changing uri swaps the stream in place. */
  source: VideoSourceInput | null;
  /** Controlled play/pause. */
  playing: boolean;
  muted?: boolean;
  /** Playback speed. Default 1. */
  rate?: number;
  /** Default "cover" (vertical short-drama). Use "contain" for letterboxed. */
  contentFit?: 'cover' | 'contain';
  /** Poster/cover shown until the first frame renders. */
  poster?: string;
  /**
   * Allow expo-video's disk cache for this load (Android). Pass false on a retry so it can't be handed
   * the same cached, possibly dead playlist again. Default true.
   */
  cache?: boolean;
  /** Seek here once the source is ready (resume position, seconds). Applied once per source. */
  startAt?: number;
  loop?: boolean;
  /** How often onProgress fires, seconds. Default 0.5. */
  progressInterval?: number;
  style?: StyleProp<ViewStyle>;

  /** Fires every `progressInterval` while time advances. */
  onProgress?: (positionSec: number, durationSec: number) => void;
  onEnd?: () => void;
  /** Source is loaded and ready to play; duration may be 0 for unknown. Once per source. */
  onReady?: (durationSec: number) => void;
  onError?: (error: VideoSurfaceError) => void;
  /** true while stalled/loading, false once frames flow. */
  onBuffering?: (buffering: boolean) => void;
  /** Mirrors the actual playing state (can differ from `playing`, e.g. autoplay blocked). */
  onPlayingChange?: (isPlaying: boolean) => void;
}

export interface VideoSurfaceHandle {
  /** Seek to absolute seconds. */
  seek: (sec: number) => void;
  /** Relative seek (e.g. ±10s double-tap). */
  seekBy: (deltaSec: number) => void;
  getPosition: () => number;
  getDuration: () => number;
  /** Reload the current source (e.g. "Coba lagi" after onError), resuming near the last position. */
  reload: () => void;
}
