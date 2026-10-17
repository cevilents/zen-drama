/* eslint-disable react-hooks/immutability -- expo-video's player is a mutable native object by design (player.loop = …, player.currentTime = …). */
import { useVideoPlayer, VideoView, type VideoPlayerStatus } from 'expo-video';
import {
  useEffect,
  useEffectEvent,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Animated, { FadeOut } from 'react-native-reanimated';

import { PosterImage } from '@/components/drama/PosterImage';
import { colors } from '@/theme';

import { toPlayerSource } from './nativeSource';
import type { VideoSurfaceProps } from './VideoSurface.types';

export type { VideoSourceInput, VideoSurfaceError, VideoSurfaceHandle, VideoSurfaceProps } from './VideoSurface.types';

/**
 * Native (iOS/Android) player surface built on expo-video.
 * One player instance per mounted surface; `source` changes swap the stream via replaceAsync.
 */
// DIAGNOSTIC (u11): compact description of a replaceAsync rejection (name/message/code) so an
// Android load failure can be told apart from a mid-play error.
function describeSwapError(e: unknown): string {
  if (e instanceof Error) {
    const code = (e as { code?: unknown }).code;
    return `swap: ${e.name}: ${e.message || 'tanpa pesan'}${code != null ? ` [${String(code)}]` : ''}`;
  }
  try {
    return `swap: ${String(e)}`;
  } catch {
    return 'swap: error tak terbaca';
  }
}

export function VideoSurface({
  ref,
  source,
  playing,
  muted = false,
  rate = 1,
  contentFit = 'cover',
  poster,
  startAt,
  cache = true,
  loop = false,
  progressInterval = 0.5,
  style,
  onProgress,
  onEnd,
  onReady,
  onError,
  onBuffering,
  onPlayingChange,
}: VideoSurfaceProps) {
  const player = useVideoPlayer(null, (p) => {
    p.timeUpdateEventInterval = progressInterval;
    p.keepScreenOnWhilePlaying = true;
    p.staysActiveInBackground = false;
  });

  // uri whose first frame has rendered; poster hides once it matches the current uri.
  const [frameUri, setFrameUri] = useState<string | null>(null);
  // Bumped by reload() to re-run the source swap for the same uri.
  const [reloadNonce, setReloadNonce] = useState(0);
  /**
   * uri whose replaceAsync has resolved, i.e. the player's current item really is this uri.
   * iOS keeps the OLD item current until the new asset loads, so player events are only
   * trusted (ready/progress/end) once this matches the current uri.
   */
  const armedUri = useRef<string | null>(null);
  const readyForUri = useRef<string | null>(null);
  const lastPos = useRef<{ uri: string; pos: number } | null>(null);
  const resumeAt = useRef<number | null>(null);
  const uri = source?.uri ?? null;
  const type = source?.type ?? null;
  const firstFrame = !!uri && frameUri === uri;

  useImperativeHandle(
    ref,
    () => ({
      seek: (sec) => {
        player.currentTime = Math.max(0, sec);
      },
      seekBy: (delta) => {
        player.seekBy(delta);
      },
      getPosition: () => player.currentTime ?? 0,
      getDuration: () => player.duration ?? 0,
      reload: () => {
        if (!uri) return;
        const last = lastPos.current;
        resumeAt.current = last && last.uri === uri && last.pos > 1 ? last.pos : null;
        setReloadNonce((n) => n + 1);
      },
    }),
    [player, uri],
  );

  // --- event wiring (stable handlers that always see latest props) -------------------
  const isArmed = () => !!uri && armedUri.current === uri;

  const handleReady = useEffectEvent(() => {
    if (!uri || armedUri.current !== uri || readyForUri.current === uri) return;
    readyForUri.current = uri;
    const seekTo = resumeAt.current ?? startAt;
    resumeAt.current = null;
    if (seekTo && seekTo > 1) player.currentTime = seekTo;
    onReady?.(player.duration ?? 0);
    if (playing) player.play();
  });

  const handleError = useEffectEvent((message?: string) => {
    // Next readyToPlay (after reload or recovery) must re-run the ready path.
    readyForUri.current = null;
    onBuffering?.(false);
    onError?.({ message: message ?? 'Video gagal diputar' });
  });

  const emitProgress = useEffectEvent((pos: number) => {
    if (!isArmed()) return; // old item still ticking during an iOS swap
    lastPos.current = { uri: uri!, pos };
    onProgress?.(pos, player.duration ?? 0);
  });
  const emitEnd = useEffectEvent(() => {
    if (isArmed()) onEnd?.();
  });
  const emitPlaying = useEffectEvent((v: boolean) => onPlayingChange?.(v));
  const emitStatus = useEffectEvent((status: VideoPlayerStatus, message?: string) => {
    if (status === 'loading') {
      onBuffering?.(true);
    } else if (status === 'readyToPlay') {
      // Ignore readiness of the previous item while the new one is still loading.
      if (!isArmed()) return;
      onBuffering?.(false);
      handleReady();
    } else if (status === 'error') {
      // DIAGNOSTIC (u11): surface the raw native status + error so the wedge can be identified.
      if (isArmed()) handleError(`play[${player.status}]: ${message ?? 'tanpa pesan'}`);
    }
  });

  useEffect(() => {
    const subs = [
      player.addListener('timeUpdate', (e) => emitProgress(e.currentTime)),
      player.addListener('playToEnd', () => emitEnd()),
      player.addListener('playingChange', (e) => emitPlaying(e.isPlaying)),
      player.addListener('statusChange', (e) => emitStatus(e.status, e.error?.message)),
    ];
    return () => subs.forEach((s) => s.remove());
  }, [player]);

  // On unmount (every episode switch mounts a fresh surface + player), detach the media BEFORE the
  // player is released so ExoPlayer closes this episode's HTTP connections right away. Without this,
  // sockets/decoders from each released player can pile up on Android until playback wedges.
  useEffect(() => {
    return () => {
      try {
        player.pause();
        void player.replaceAsync(null).catch(() => {});
      } catch {
        // player already released — nothing to free.
      }
    };
  }, [player]);

  // --- source swap -----------------------------------------------------------------------
  const onSwapped = useEffectEvent((swappedUri: string) => {
    armedUri.current = swappedUri;
    if (player.status === 'readyToPlay') {
      onBuffering?.(false);
      handleReady();
    } else if (player.status === 'error') {
      handleError();
    }
  });
  const onSwapFailed = useEffectEvent((message: string) => handleError(message));

  useEffect(() => {
    // Cleanup flips this so a slower, superseded replaceAsync can't arm a stale uri.
    let cancelled = false;
    armedUri.current = null;
    readyForUri.current = null;
    player.pause();
    if (!uri) {
      player.replaceAsync(null).catch(() => {});
      return () => {
        cancelled = true;
      };
    }
    player
      .replaceAsync(toPlayerSource({ uri, type: type! }, cache && reloadNonce === 0))
      .then(() => {
        if (!cancelled) onSwapped(uri);
      })
      .catch((e: unknown) => {
        if (!cancelled) onSwapFailed(describeSwapError(e));
      });
    return () => {
      cancelled = true;
    };
  }, [player, uri, type, cache, reloadNonce]);

  // --- controlled props ------------------------------------------------------------------
  useEffect(() => {
    // Before the swap resolves the player still holds the old item; handleReady starts playback.
    if (playing && uri && armedUri.current === uri) player.play();
    else player.pause();
  }, [player, playing, uri]);

  useEffect(() => {
    player.muted = muted;
  }, [player, muted]);

  useEffect(() => {
    player.playbackRate = rate;
  }, [player, rate]);

  useEffect(() => {
    player.loop = loop;
  }, [player, loop]);

  useEffect(() => {
    player.timeUpdateEventInterval = progressInterval;
  }, [player, progressInterval]);

  return (
    <View style={[styles.root, style]}>
      <VideoView
        player={player}
        nativeControls={false}
        contentFit={contentFit}
        allowsPictureInPicture={false}
        // TextureView composes correctly inside pagers/overlays on Android (no black flashes).
        surfaceType={Platform.OS === 'android' ? 'textureView' : undefined}
        onFirstFrameRender={() => setFrameUri(uri)}
        style={StyleSheet.absoluteFill}
      />
      {poster && !firstFrame && (
        <Animated.View exiting={FadeOut.duration(220)} style={StyleSheet.absoluteFill} pointerEvents="none">
          <PosterImage
            uri={poster}
            aspectRatio={undefined}
            radius={0}
            contentFit={contentFit}
            transition={0}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: colors.black, overflow: 'hidden' },
});
