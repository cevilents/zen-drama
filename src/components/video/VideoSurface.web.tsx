import HlsPlayer, { ErrorDetails, ErrorTypes, Events, type ErrorData } from 'hls.js';
import {
  useEffect,
  useEffectEvent,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { StyleSheet, View } from 'react-native';

import { colors } from '@/theme';

import type { VideoSurfaceProps } from './VideoSurface.types';

export type { VideoSourceInput, VideoSurfaceError, VideoSurfaceHandle, VideoSurfaceProps } from './VideoSurface.types';

/**
 * Web player surface: a bare <video playsInline> with hls.js for HLS when MSE is available
 * (falls back to native HLS on Safari/iOS). Same props + ref API as the native VideoSurface.
 */
function hlsSupported(): boolean {
  // eslint-disable-next-line import/no-named-as-default-member
  return HlsPlayer.isSupported();
}

/** Playlist failures that hls.js has already retried internally; restarting the load just loops. */
const UNRECOVERABLE_DETAILS = new Set<string>([
  ErrorDetails.MANIFEST_LOAD_ERROR,
  ErrorDetails.MANIFEST_LOAD_TIMEOUT,
  ErrorDetails.MANIFEST_PARSING_ERROR,
  ErrorDetails.LEVEL_LOAD_ERROR,
]);
const MAX_NETWORK_RECOVERIES = 2;
const MAX_MEDIA_RECOVERIES = 2;

export function VideoSurface({
  ref,
  source,
  playing,
  muted = false,
  rate = 1,
  contentFit = 'cover',
  poster,
  startAt,
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
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const readyForUri = useRef<string | null>(null);
  const lastProgressAt = useRef(0);
  const lastPos = useRef<{ uri: string; pos: number } | null>(null);
  const resumeAt = useRef<number | null>(null);
  // Autoplay-blocked is reported once per uri (every tryPlay would otherwise re-fire it).
  const autoplayReportedFor = useRef<string | null>(null);
  // Bumped by reload() to re-attach the same uri.
  const [reloadNonce, setReloadNonce] = useState(0);
  const uri = source?.uri ?? null;
  const type = source?.type ?? null;

  /**
   * uri we force-muted after the browser refused autoplay with sound. Cleared whenever the
   * parent changes `muted`, so an explicit unmute (true -> false) actually reaches the element.
   */
  const [forcedMuteUri, setForcedMuteUri] = useState<string | null>(null);
  const [prevMuted, setPrevMuted] = useState(muted);
  if (prevMuted !== muted) {
    setPrevMuted(muted);
    setForcedMuteUri(null);
  }
  const effectiveMuted = muted || (!!uri && forcedMuteUri === uri);

  useImperativeHandle(
    ref,
    () => ({
      seek: (sec) => {
        const v = videoRef.current;
        if (v) v.currentTime = Math.max(0, sec);
      },
      seekBy: (delta) => {
        const v = videoRef.current;
        if (v) v.currentTime = Math.max(0, Math.min((v.duration || Infinity) - 0.1, v.currentTime + delta));
      },
      getPosition: () => videoRef.current?.currentTime ?? 0,
      getDuration: () => {
        const d = videoRef.current?.duration ?? 0;
        return Number.isFinite(d) ? d : 0;
      },
      reload: () => {
        if (!uri) return;
        const last = lastPos.current;
        resumeAt.current = last && last.uri === uri && last.pos > 1 ? last.pos : null;
        setReloadNonce((n) => n + 1);
      },
    }),
    [uri],
  );

  const tryPlay = useEffectEvent(() => {
    const v = videoRef.current;
    if (!v || !uri || !playing) return;
    v.play().catch((err: unknown) => {
      const name = err instanceof Error ? err.name : '';
      if (name === 'NotAllowedError') {
        // Browser blocked autoplay with sound: retry muted so the feed still moves.
        v.muted = true;
        setForcedMuteUri(uri);
        v.play().catch(() => {});
        if (autoplayReportedFor.current !== uri) {
          autoplayReportedFor.current = uri;
          onError?.({ message: 'Autoplay diblokir browser', autoplayBlocked: true });
        }
      }
      // AbortError = interrupted by a new load/pause; safe to ignore.
    });
  });

  // --- source attach (hls.js or native) --------------------------------------------------
  const emitFatal = useEffectEvent((message: string) => {
    onBuffering?.(false);
    onError?.({ message });
  });

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    readyForUri.current = null;
    if (!uri) {
      resumeAt.current = null;
      video.pause();
      video.removeAttribute('src');
      video.load();
      return;
    }

    let hls: HlsPlayer | null = null;
    let mediaRecoveries = 0;
    let networkRecoveries = 0;
    const canNativeHls = video.canPlayType('application/vnd.apple.mpegurl') !== '';

    if (type === 'hls' && hlsSupported()) {
      hls = new HlsPlayer({ enableWorker: true, maxBufferLength: 30, backBufferLength: 30 });
      // hls.js would show a DEFAULT subtitle rendition from the playlist as a native text track,
      // doubling up with the app's own subtitle overlay (fed from /api/episode `subtitles`).
      hls.subtitleDisplay = false;
      hls.on(Events.ERROR, (_evt, data: ErrorData) => {
        if (!data.fatal || !hls) return;
        if (
          data.type === ErrorTypes.NETWORK_ERROR &&
          !UNRECOVERABLE_DETAILS.has(data.details) &&
          networkRecoveries < MAX_NETWORK_RECOVERIES
        ) {
          networkRecoveries += 1;
          hls.startLoad();
        } else if (data.type === ErrorTypes.MEDIA_ERROR && mediaRecoveries < MAX_MEDIA_RECOVERIES) {
          mediaRecoveries += 1;
          hls.recoverMediaError();
        } else {
          emitFatal('Video gagal diputar');
          hls.destroy();
          hls = null;
        }
      });
      hls.loadSource(uri);
      hls.attachMedia(video);
    } else if (type === 'hls' && !canNativeHls) {
      emitFatal('Browser ini tidak mendukung HLS');
      return;
    } else {
      video.src = uri;
      video.load();
    }

    tryPlay();

    return () => {
      hls?.destroy();
      video.pause();
      video.removeAttribute('src');
      video.load();
    };
  }, [uri, type, reloadNonce]);

  // --- DOM events ------------------------------------------------------------------------
  const onEvent = useEffectEvent((e: Event) => {
    const v = videoRef.current;
    if (!v) return;
    const duration = Number.isFinite(v.duration) ? v.duration : 0;
    switch (e.type) {
      case 'loadedmetadata':
        if (uri && readyForUri.current !== uri) {
          readyForUri.current = uri;
          const seekTo = resumeAt.current ?? startAt;
          resumeAt.current = null;
          if (seekTo && seekTo > 1) v.currentTime = seekTo;
          v.playbackRate = rate;
          onReady?.(duration);
          tryPlay();
        }
        break;
      case 'timeupdate': {
        const now = Date.now();
        if (now - lastProgressAt.current >= progressInterval * 1000 - 30) {
          lastProgressAt.current = now;
          if (uri) lastPos.current = { uri, pos: v.currentTime };
          onProgress?.(v.currentTime, duration);
        }
        break;
      }
      case 'ended':
        onEnd?.();
        break;
      case 'waiting':
      case 'loadstart':
        onBuffering?.(true);
        break;
      case 'playing':
      case 'canplay':
      case 'seeked':
        onBuffering?.(false);
        break;
      case 'play':
        onPlayingChange?.(true);
        break;
      case 'pause':
        onPlayingChange?.(false);
        break;
      case 'error':
        // hls.js reports its own errors; this covers progressive/native sources.
        if (v.error && !(type === 'hls' && hlsSupported())) {
          onBuffering?.(false);
          onError?.({ message: v.error.message || 'Video gagal diputar' });
        }
        break;
    }
  });

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const events = [
      'loadedmetadata',
      'timeupdate',
      'ended',
      'waiting',
      'loadstart',
      'playing',
      'canplay',
      'seeked',
      'play',
      'pause',
      'error',
    ];
    const handler = (e: Event) => onEvent(e);
    events.forEach((ev) => v.addEventListener(ev, handler));
    return () => events.forEach((ev) => v.removeEventListener(ev, handler));
  }, []);

  // --- controlled props ------------------------------------------------------------------
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (playing && uri) tryPlay();
    else v.pause();
  }, [playing, uri]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = effectiveMuted;
  }, [effectiveMuted]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    // hls.js recoverMediaError() re-attaches media and resets playbackRate to defaultPlaybackRate.
    v.defaultPlaybackRate = rate;
    v.playbackRate = rate;
  }, [rate, uri]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.loop = loop;
  }, [loop]);

  const videoStyle: CSSProperties = {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: contentFit,
    backgroundColor: colors.black,
    display: 'block',
  };

  return (
    <View style={[styles.root, style]}>
      <video
        ref={videoRef}
        playsInline
        muted={effectiveMuted}
        preload="auto"
        poster={poster}
        disablePictureInPicture
        disableRemotePlayback
        controls={false}
        style={videoStyle}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: colors.black, overflow: 'hidden' },
});
