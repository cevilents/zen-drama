import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { isStaleStreamUrl } from '@/api/client';
import { queryKeys, useEpisode, usePrefetchEpisode } from '@/api/hooks';
import type { DramaDetail, StreamType } from '@/api/types';
import { shareDrama } from '@/components/detail/share';
import { PosterImage } from '@/components/drama/PosterImage';
import { AppText } from '@/components/ui/AppText';
import { StreamPreloader, VideoSurface, type VideoSurfaceError, type VideoSurfaceHandle } from '@/components/video';
import { NATIVE_PREFETCH_ENABLED } from '@/components/video/nativeSource';
import { useStreamRecovery } from '@/components/video/useStreamRecovery';
import { useAppActive } from '@/components/feed/useAppActive';
import { formatDuration } from '@/lib/format';
import { haptics } from '@/lib/haptics';
import { resumePosition, useHistory } from '@/store/useHistory';
import { useIsFavorite, useLibrary } from '@/store/useLibrary';
import { useSettings } from '@/store/useSettings';
import { colors, gradients, motion, radii, spacing } from '@/theme';

import { CenterControl } from './CenterControl';
import { EndCard } from './EndCard';
import { EpisodeInfo } from './EpisodeInfo';
import { GestureSurface } from './GestureSurface';
import { pickStream } from './pickStream';
import { pickSubtitle, type SubtitleChoice } from './pickSubtitle';
import { playerLayout } from './playerLayout';
import type { PlayerNotice } from './PlayerToast';
import { RightRail } from './RightRail';
import { Scrubber } from './Scrubber';
import { SeekRipple, type SeekRippleState } from './SeekRipple';
import { EpisodeErrorCard, LockedCard, UpNextCard } from './StateCards';
import { clockTime, createClock, SubtitleOverlay, updateClock } from './SubtitleOverlay';
import { useProgressSaver } from './useProgressSaver';

export interface ActiveEpisodeProps {
  drama: DramaDetail;
  episode: number;
  total: number;
  width: number;
  height: number;
  contentFit: 'cover' | 'contain';
  /** Wide-screen stage: safe-area insets don't apply inside it. */
  ignoreInsets?: boolean;
  controlsVisible: boolean;
  setControlsVisible: (visible: boolean) => void;
  muted: boolean;
  onAutoplayBlocked: () => void;
  /** Move the pager to the next episode. */
  onRequestNext: () => void;
  onScrubbingChange: (scrubbing: boolean) => void;
  /** Web: handle play/pause/seek keys. false while a sheet is open over the player. */
  keyboardEnabled?: boolean;
  /** Reports the end-of-episode state (the screen hides its web arrows behind end cards). */
  onEndedChange?: (ended: boolean) => void;
  onOpenEpisodes: () => void;
  onOpenSettings: () => void;
  onNotify: (notice: Omit<PlayerNotice, 'id'>) => void;
  onClose: () => void;
  /** Subtitle picked in the playback sheet this session; null = follow the subtitle setting. */
  subtitleChoice: SubtitleChoice | null;
}

const SEEK_STEP = 10;
const AUTO_HIDE_MS = 3000;
/** Playback seconds after which the next episode's data is fetched. */
const PREFETCH_AFTER_SEC = 2;
/** Extra wait before its stream is preloaded, so the preload doesn't compete with this episode's startup. */
const PRELOAD_DELAY_MS = 4000;

// DIAGNOSTIC (u10): how many episode players have mounted this app session, shown on the error card
// with the raw native error, to pinpoint the Android playback wedge. Remove once fixed.
let sessionEpisodeMounts = 0;
/** Older episode data may carry an expired signed URL; refetch it before handing it to a player. */
const MAX_DATA_AGE_MS = 5 * 60_000;
const KEEP_AWAKE_TAG = 'zendrama-player';

/** The stream actually playing. Pinned once playback starts so a refetched (re-signed) URL can't restart it. */
interface PinnedStream {
  uri: string;
  type: StreamType;
  /** preferredQuality when pinned; a different preference = explicit quality switch. */
  quality: string | null;
}

/** Elements whose own keyboard activation must not also toggle the player. */
function isTextTarget(t: HTMLElement | null) {
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
}
function isButtonTarget(t: HTMLElement | null) {
  return !!t?.closest?.('button, a[href], [role="button"], [role="link"], [role="tab"], [role="switch"]');
}

/** The single live page of the pager: video + gestures + overlay + per-episode states. */
export function ActiveEpisode({
  drama,
  episode,
  total,
  width,
  height,
  contentFit,
  ignoreInsets,
  controlsVisible,
  setControlsVisible,
  muted,
  onAutoplayBlocked,
  onRequestNext,
  onScrubbingChange,
  keyboardEnabled = true,
  onEndedChange,
  onOpenEpisodes,
  onOpenSettings,
  onNotify,
  onClose,
  subtitleChoice,
}: ActiveEpisodeProps) {
  const insets = useSafeAreaInsets();
  const bottomInset = ignoreInsets ? 0 : insets.bottom;
  const videoRef = useRef<VideoSurfaceHandle>(null);
  const qc = useQueryClient();
  const query = useEpisode(drama.source, drama.id, episode);
  const prefetch = usePrefetchEpisode();
  const saver = useProgressSaver(drama, episode);

  const rate = useSettings((s) => s.playbackRate);
  const autoplayNext = useSettings((s) => s.autoplayNext);
  const preferredQuality = useSettings((s) => s.preferredQuality);
  const dataSaver = useSettings((s) => s.dataSaver);
  const contentLang = useSettings((s) => s.contentLang);
  const subtitleLang = useSettings((s) => s.subtitleLang);
  const favorite = useIsFavorite(drama.source, drama.id);

  const appActive = useAppActive();

  const [paused, setPaused] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [buffering, setBuffering] = useState(true);
  const [ended, setEnded] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [diagError, setDiagError] = useState<string | null>(null);
  const [mountSeq] = useState(() => (sessionEpisodeMounts += 1));
  const [reloadKey, setReloadKey] = useState(0);
  const [boost, setBoost] = useState(false);
  const [scrubbing, setScrubbing] = useState(false);
  const [ripple, setRipple] = useState<SeekRippleState | null>(null);
  const [positionSec, setPositionSec] = useState(0);
  const [durationSec, setDurationSec] = useState(0);
  const [activity, setActivity] = useState(0);
  const [hasFrames, setHasFrames] = useState(false);
  const [startAt, setStartAt] = useState(() =>
    resumePosition(useHistory.getState().getEntry(drama.source, drama.id), episode),
  );
  const [pinned, setPinned] = useState<PinnedStream | null>(null);
  const [playbackStarted, setPlaybackStarted] = useState(false);
  // Next episode is observed (kept cached) and its stream preloaded from here on.
  const [nextWarm, setNextWarm] = useState(false);
  const [captionHeight, setCaptionHeight] = useState(0);

  const progress = useSharedValue(0);
  const overlay = useSharedValue(controlsVisible ? 1 : 0);
  const lastRippleAt = useRef(0);
  const prefetched = useRef(false);
  const resumeAnnounced = useRef(false);
  /** Seek target whose first progress tick may still report the pre-seek position. */
  const pendingSeek = useRef<number | null>(null);
  /** Precise playback clock for the subtitle overlay (positionSec is whole seconds). */
  const subtitleClock = useRef(createClock(startAt));

  // Entry cached long ago (kept observed through a long pause on the previous episode): its signed URL may
  // be dead, so wait for the one refetch below instead of starting a player on it.
  const [staleAtMount] = useState(() => {
    const at = qc.getQueryState(queryKeys.episode(drama.source, drama.id, episode, contentLang))?.dataUpdatedAt ?? 0;
    return at && Date.now() - at > MAX_DATA_AGE_MS ? at : 0;
  });
  const { refetch: refetchEpisode } = query;
  useEffect(() => {
    if (staleAtMount) void refetchEpisode();
  }, [staleAtMount, refetchEpisode]);
  const data = staleAtMount && query.dataUpdatedAt <= staleAtMount ? undefined : query.data;
  const isLast = episode >= total;
  const hasNext = !isLast;
  // `locked` is informational: if the endpoint hands us a stream, play it.
  const locked = !!data && !data.url;
  const picked = data ? pickStream(data, preferredQuality) : null;
  const quality = picked?.quality;
  const wantedUri = picked?.stream?.uri ?? null;
  const subtitle = pickSubtitle(data?.subtitles, subtitleChoice, subtitleLang, contentLang);

  // Pin the stream once playback has started. A different URL is only accepted for an explicit
  // quality change (resume at the current position) or a retry (which clears the pin).
  if (data && wantedUri && wantedUri !== pinned?.uri) {
    const qualityChanged = !!pinned && pinned.quality !== preferredQuality;
    if (!pinned || !hasFrames || qualityChanged) {
      setPinned({ uri: wantedUri, type: data.type, quality: preferredQuality });
      if (pinned && hasFrames && positionSec > 1) setStartAt(positionSec);
    }
  } else if (pinned && wantedUri === pinned.uri && pinned.quality !== preferredQuality) {
    // Preferred quality not offered for this episode: same stream, just record the preference.
    setPinned({ ...pinned, quality: preferredQuality });
  }

  // A failed (re)fetch with nothing playing yet: the URL we hold is not trustworthy, show the error card.
  const fetchFailed = !!query.error && (!data || !hasFrames);
  const blocked = locked || !!videoError || fetchFailed;
  const playing = !paused && !ended && !blocked && !scrubbing;

  // Back to a clean load that accepts whatever stream the endpoint returns next, resuming near here.
  const resetStream = () => {
    setVideoError(null);
    setBuffering(true);
    setStartAt(positionSec > 1 ? positionSec : startAt);
    setPinned(null);
    setHasFrames(false);
    setReloadKey((k) => k + 1);
  };

  // A dead stream (server restarted, tunnel moved) fails inside the player, not in apiGet: re-discover the
  // server and refetch once per episode load. While that runs the old URL stays away from the player.
  const { recovering, refresh, fail, reportProgress } = useStreamRecovery({
    refetch: query.refetch,
    uri: pinned?.uri ?? null,
    // Not while backgrounded: a stall right after resuming is the player catching up, not a dead stream.
    stalled: !!pinned && !locked && !fetchFailed && playing && buffering && appActive,
    errored: !locked && (!!videoError || fetchFailed),
    onRecover: resetStream,
    onGiveUp: setVideoError,
  });
  const source = pinned && !locked && !recovering && !fetchFailed ? { uri: pinned.uri, type: pinned.type } : null;

  // Same selection the next ActiveEpisode makes on mount, so its player asks for the URL we cached.
  // useEpisode masks cached URLs from a dead server origin (and refetches them once); the explicit
  // check covers a quality URL on another origin than the one the default URL was masked against.
  const nextQuery = useEpisode(drama.source, drama.id, nextWarm ? episode + 1 : undefined);
  const nextData = nextQuery.data;
  const nextStream = nextData ? pickStream(nextData, preferredQuality).stream : null;
  // Observed since PREFETCH_AFTER_SEC, so after a long pause the URL can be expired: refetch it once, preload after.
  // eslint-disable-next-line react-hooks/purity -- age only ever grows until a refetch, so re-evaluating per render is safe.
  const nextAged = !!nextData && Date.now() - nextQuery.dataUpdatedAt > MAX_DATA_AGE_MS;
  const nextRefreshed = useRef(false);
  const { refetch: refetchNext } = nextQuery;
  useEffect(() => {
    if (!nextAged || nextRefreshed.current) return;
    nextRefreshed.current = true;
    void refetchNext();
  }, [nextAged, refetchNext]);
  // Only while this episode streams healthily, so the preload never competes with a struggling main stream.
  const preloadSource =
    nextStream &&
    !nextAged &&
    !dataSaver &&
    !blocked &&
    !recovering &&
    isPlaying &&
    !buffering &&
    !isStaleStreamUrl(nextStream.uri)
      ? nextStream
      : null;

  useEffect(() => {
    overlay.set(withTiming(controlsVisible ? 1 : 0, { duration: motion.duration.normal }));
  }, [controlsVisible, overlay]);

  useEffect(() => {
    if (!playbackStarted || Platform.OS === 'web') return;
    const t = setTimeout(() => setNextWarm(true), PRELOAD_DELAY_MS);
    return () => clearTimeout(t);
  }, [playbackStarted]);

  // The subtitle clock only runs ahead between progress ticks while frames actually advance.
  const clockRate = boost ? 2 : rate;
  const clockRunning = isPlaying && !buffering && playing;
  useEffect(() => {
    updateClock(subtitleClock.current, { rate: clockRate, playing: clockRunning });
  }, [clockRate, clockRunning]);

  // Auto-hide the overlay after 3s of uninterrupted playback.
  useEffect(() => {
    if (!controlsVisible || paused || scrubbing || !isPlaying || blocked) return;
    const t = setTimeout(() => setControlsVisible(false), AUTO_HIDE_MS);
    return () => clearTimeout(t);
  }, [controlsVisible, paused, scrubbing, isPlaying, blocked, activity, setControlsVisible]);

  // Keep the screen on only while video actually plays (web: Wake Lock; native also via expo-video).
  useEffect(() => {
    if (!isPlaying) return;
    activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
    return () => {
      deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
    };
  }, [isPlaying]);

  // The parent mirrors `ended` (set from the handlers below); clear it when this page goes away.
  useEffect(() => () => onEndedChange?.(false), [onEndedChange]);

  const updateEnded = (value: boolean) => {
    if (value === ended) return;
    setEnded(value);
    onEndedChange?.(value);
  };

  const bump = () => setActivity((n) => n + 1);

  // --- playback actions -------------------------------------------------------------------
  const togglePause = () => {
    if (ended) {
      replay();
      return;
    }
    if (!paused) saver.flush();
    setPaused(!paused);
    setControlsVisible(true);
    bump();
  };

  const seekBy = (delta: number) => {
    videoRef.current?.seekBy(delta);
    pendingSeek.current = Math.max(0, positionSec + delta);
    updateClock(subtitleClock.current, { pos: Math.max(0, clockTime(subtitleClock.current) + delta) });
    if (ended && delta < 0) updateEnded(false);
    const side = delta < 0 ? 'left' : 'right';
    const now = Date.now();
    const chained = !!ripple && ripple.side === side && now - lastRippleAt.current < 900;
    lastRippleAt.current = now;
    setRipple({ id: (ripple?.id ?? 0) + 1, side, amount: chained && ripple ? ripple.amount + SEEK_STEP : SEEK_STEP });
    bump();
  };

  const seekTo = (sec: number) => {
    videoRef.current?.seek(sec);
    pendingSeek.current = sec;
    updateClock(subtitleClock.current, { pos: sec });
    setPositionSec(Math.floor(sec));
    if (ended) updateEnded(false);
    bump();
  };

  const replay = () => {
    videoRef.current?.seek(0);
    pendingSeek.current = 0;
    updateClock(subtitleClock.current, { pos: 0 });
    progress.set(0);
    updateEnded(false);
    setPaused(false);
    setControlsVisible(false);
  };

  // Explicit retry: the server may be back on a new address, so look it up before refetching.
  const retry = () => {
    resetStream();
    void refresh();
  };

  const toggleFavorite = () => {
    const nowFavorite = useLibrary.getState().toggleFavorite(drama);
    if (nowFavorite) haptics.success();
    onNotify(
      nowFavorite
        ? { message: 'Ditambahkan ke Daftarku', icon: 'heart', iconColor: colors.primary }
        : { message: 'Dihapus dari Daftarku', icon: 'heart-dislike-outline' },
    );
    bump();
  };

  const handleScrubbing = (active: boolean) => {
    setScrubbing(active);
    onScrubbingChange(active);
    if (!active) bump();
  };

  // --- VideoSurface events ----------------------------------------------------------------
  const onProgress = (pos: number, dur: number) => {
    const target = pendingSeek.current;
    if (target != null) {
      pendingSeek.current = null;
      // One tick right after a seek can still carry the old position; don't snap the bar back.
      if (Math.abs(pos - target) > 1.5) return;
    }
    updateClock(subtitleClock.current, { pos });
    if (dur > 0) {
      progress.set(withTiming(Math.min(1, pos / dur), { duration: 260, easing: Easing.linear }));
      if (dur !== durationSec) setDurationSec(dur);
    }
    reportProgress(pos);
    if (!hasFrames && pos > 0) setHasFrames(true);
    const whole = Math.floor(pos);
    if (whole !== positionSec) setPositionSec(whole);
    saver.report(pos, dur);
    if (!prefetched.current && hasNext && pos >= PREFETCH_AFTER_SEC) {
      prefetched.current = true;
      prefetch(drama.source, drama.id, episode + 1);
      setPlaybackStarted(true);
    }
  };

  const onReady = (dur: number) => {
    if (dur > 0) setDurationSec(dur);
    // Only the first load can be a resume; later loads (quality switch, retry) keep their position quietly.
    if (resumeAnnounced.current) return;
    resumeAnnounced.current = true;
    if (startAt <= 1) return;
    if (dur > 0 && startAt > dur - 3) {
      // Resume point at the very end (finished episode): start over instead.
      videoRef.current?.seek(0);
      return;
    }
    onNotify({ message: `Melanjutkan dari ${formatDuration(startAt)}`, icon: 'play-forward' });
  };

  const onEnd = () => {
    const dur = durationSec || videoRef.current?.getDuration() || 0;
    saver.report(dur, dur);
    saver.flush(true);
    progress.set(1);
    if (autoplayNext && hasNext) {
      onRequestNext();
      return;
    }
    updateEnded(true);
    setControlsVisible(false);
  };

  const onError = (e: VideoSurfaceError) => {
    if (e.autoplayBlocked) {
      onAutoplayBlocked();
      return;
    }
    setDiagError(e.message ?? 'tanpa pesan');
    // First failure of this episode load: try to recover quietly; only a repeat reaches the error card.
    fail(e.message);
  };

  const onPlayingChange = (p: boolean) => {
    setIsPlaying(p);
    if (!p) saver.flush();
  };

  // --- web keyboard: space/k = play-pause, ←/→ = seek ------------------------------------
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (!keyboardEnabled || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    const target = e.target as HTMLElement | null;
    if (isTextTarget(target)) return;
    if (e.key === ' ' || e.key === 'k') {
      // A focused button handles Space itself; key-repeat must not flicker play/pause.
      if (e.repeat || (e.key === ' ' && isButtonTarget(target))) return;
      e.preventDefault();
      togglePause();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      seekBy(-SEEK_STEP);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      seekBy(SEEK_STEP);
    }
  });
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const handler = (e: KeyboardEvent) => onKey(e);
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // --- styles -----------------------------------------------------------------------------
  const overlayStyle = useAnimatedStyle(() => ({ opacity: overlay.get() }));
  const miniStyle = useAnimatedStyle(() => ({ opacity: 1 - overlay.get() }));
  const miniFill = useAnimatedStyle(() => ({ width: `${progress.get() * 100}%` }));

  const captionBottom = playerLayout.captionBottom(bottomInset);
  const bottomPad = playerLayout.bottomPad(bottomInset);
  const showOverlay = !ended || !isLast;
  // Above the caption block while the controls show, low over the frame once they hide.
  const controlsShown = controlsVisible && showOverlay;
  const subtitleBottom = controlsShown ? captionBottom + captionHeight + spacing[3] : bottomPad + spacing[6];
  const qualityLabel = data && data.qualities.length > 1 ? (quality?.label ?? 'Otomatis') : null;

  return (
    <View style={[styles.root, { width, height }]}>
      <VideoSurface
        key={reloadKey}
        ref={videoRef}
        source={source}
        // A recovery or manual retry (reloadKey > 0) must hit the network, not a cached copy of the dead playlist.
        cache={reloadKey === 0}
        playing={playing}
        muted={muted}
        rate={boost ? 2 : rate}
        contentFit={contentFit}
        poster={drama.cover || undefined}
        startAt={startAt}
        progressInterval={0.25}
        onProgress={onProgress}
        onReady={onReady}
        onEnd={onEnd}
        onError={onError}
        onBuffering={setBuffering}
        onPlayingChange={onPlayingChange}
        style={StyleSheet.absoluteFill}
      />

      {NATIVE_PREFETCH_ENABLED && preloadSource && <StreamPreloader source={preloadSource} />}

      {/* Web: <video poster> is unreliable with MSE sources, so cover the first-frame gap ourselves. */}
      {Platform.OS === 'web' && !hasFrames && !!drama.cover && (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <PosterImage
            uri={drama.cover}
            aspectRatio={width / height}
            radius={0}
            transition={0}
            contentFit={contentFit}
            style={StyleSheet.absoluteFill}
          />
        </View>
      )}

      <GestureSurface
        width={width}
        onSingleTap={() => {
          setControlsVisible(!controlsVisible);
          bump();
        }}
        onDoubleTap={(side) => seekBy(side === 'left' ? -SEEK_STEP : SEEK_STEP)}
        onHoldStart={() => {
          if (!playing) return;
          haptics.light();
          setBoost(true);
        }}
        onHoldEnd={() => setBoost(false)}
      />

      <SeekRipple ripple={ripple} width={width} height={height} />

      {/* Thin progress line while the overlay is hidden. */}
      <Animated.View pointerEvents="none" style={[styles.mini, { bottom: bottomPad - 1 }, miniStyle]}>
        <Animated.View style={[styles.miniFill, miniFill]} />
      </Animated.View>

      {showOverlay && (
        <Animated.View
          pointerEvents={controlsVisible ? 'box-none' : 'none'}
          style={[StyleSheet.absoluteFill, overlayStyle]}>
          <LinearGradient colors={gradients.videoBottom} style={styles.bottomFade} pointerEvents="none" />
          <EpisodeInfo
            title={drama.title}
            episode={episode}
            total={total}
            synopsis={drama.description}
            style={[styles.caption, { bottom: captionBottom, right: playerLayout.railWidth + playerLayout.gutter }]}
            onLayout={(e) => setCaptionHeight(Math.round(e.nativeEvent.layout.height))}
          />
          <RightRail
            favorite={favorite}
            rate={rate}
            onToggleFavorite={toggleFavorite}
            onOpenEpisodes={onOpenEpisodes}
            onShare={() => shareDrama(drama, episode)}
            onOpenSpeed={onOpenSettings}
            style={[styles.rail, { bottom: captionBottom + spacing[2] }]}
          />
          <View style={[styles.scrubArea, { bottom: bottomPad }]}>
            <View style={styles.timeRow}>
              <AppText variant="caption" weight="semibold" tabular style={styles.shadow}>
                {formatDuration(positionSec)}
                <AppText variant="caption" color="rgba(255,255,255,0.6)" tabular>
                  {' / '}
                  {formatDuration(durationSec)}
                </AppText>
              </AppText>
              {qualityLabel && (
                <AppText variant="caption" weight="bold" color="rgba(255,255,255,0.7)" style={[styles.shadow, styles.quality]}>
                  {qualityLabel}
                </AppText>
              )}
            </View>
            <Scrubber
              progress={progress}
              duration={durationSec}
              onSeek={seekTo}
              onScrubbingChange={handleScrubbing}
            />
          </View>
        </Animated.View>
      )}

      {subtitle && source && hasFrames && !blocked && !ended && (
        <SubtitleOverlay
          key={subtitle.url}
          url={subtitle.url}
          clock={subtitleClock}
          bottom={subtitleBottom}
          right={controlsShown ? playerLayout.railWidth + playerLayout.gutter : playerLayout.gutter}
        />
      )}

      {(!blocked || recovering) && !ended && (
        <CenterControl
          visible={controlsVisible || paused}
          paused={paused}
          buffering={buffering || (query.isPending && !data)}
          onToggle={togglePause}
        />
      )}

      {boost && (
        <View pointerEvents="none" style={[styles.boost, { top: (ignoreInsets ? 0 : insets.top) + 64 }]}>
          <View style={styles.boostPill}>
            <AppText variant="label" weight="extrabold" tabular>
              2x
            </AppText>
            <Ionicons name="play-forward" size={14} color={colors.white} />
          </View>
        </View>
      )}

      {locked && (
        <LockedCard episode={episode} onNext={hasNext ? onRequestNext : undefined} onOpenEpisodes={onOpenEpisodes} />
      )}
      {!locked && !recovering && (videoError || fetchFailed) && (
        <EpisodeErrorCard
          error={query.error ?? undefined}
          title={videoError ? 'Video gagal diputar' : undefined}
          message={videoError ? 'Stream episode ini tidak bisa dimuat. Coba lagi atau lanjut ke episode berikutnya.' : undefined}
          onRetry={retry}
          onNext={hasNext ? onRequestNext : undefined}
          detail={`#${mountSeq} · ${drama.source} · ${diagError ?? (fetchFailed ? 'gagal memuat data episode' : '-')}`}
        />
      )}
      {ended && hasNext && <UpNextCard nextEpisode={episode + 1} onPlayNext={onRequestNext} onReplay={replay} />}
      {ended && isLast && <EndCard drama={drama} width={width} onReplay={replay} onClose={onClose} />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: colors.black, overflow: 'hidden' },
  bottomFade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '48%' },
  caption: { position: 'absolute', left: playerLayout.gutter },
  rail: { position: 'absolute', right: spacing[2] },
  scrubArea: { position: 'absolute', left: playerLayout.gutter, right: playerLayout.gutter },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    height: 18,
  },
  shadow: {
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 6,
    textShadowOffset: { width: 0, height: 1 },
  },
  quality: {
    paddingHorizontal: spacing[1.5],
    borderRadius: radii.xs,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.4)',
    fontSize: 10,
    lineHeight: 14,
  },
  mini: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  miniFill: { height: '100%', backgroundColor: colors.primary },
  boost: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  boostPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[1.5],
    borderRadius: radii.pill,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassBorder,
  },
});
