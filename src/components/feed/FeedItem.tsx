import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Easing, useSharedValue, withTiming } from 'react-native-reanimated';

import { useEpisode } from '@/api/hooks';
import type { Drama } from '@/api/types';
import { PosterImage } from '@/components/drama/PosterImage';
import { pickSubtitle } from '@/components/player/pickSubtitle';
import { createClock, SubtitleOverlay, updateClock } from '@/components/player/SubtitleOverlay';
import { AppText } from '@/components/ui/AppText';
import { FadeIn } from '@/components/ui/FadeIn';
import { GlassView } from '@/components/ui/GlassView';
import { GradientButton } from '@/components/ui/GradientButton';
import { PressableScale } from '@/components/ui/PressableScale';
import { VideoSurface, type VideoSurfaceError } from '@/components/video';
import { useStreamRecovery } from '@/components/video/useStreamRecovery';
import { haptics } from '@/lib/haptics';
import { dramaHref, watchHref } from '@/lib/routes';
import { useHistoryEntry } from '@/store/useHistory';
import { useIsFavorite, useLibrary } from '@/store/useLibrary';
import { useSettings } from '@/store/useSettings';
import { toast } from '@/store/useToast';
import { colors, gradients, layout, radii, spacing } from '@/theme';

import { FeedInfo } from './FeedInfo';
import { FeedProgress } from './FeedProgress';
import { FeedRail } from './FeedRail';
import { HeartBurst } from './HeartBurst';
import { onVideo, videoTextShadow } from './overlay';
import { shareDrama } from './share';

export interface FeedItemProps {
  drama: Drama;
  width: number;
  height: number;
  /** The page currently snapped into view. */
  active: boolean;
  /** Resolve the episode and mount the player (active page + the next one). */
  preload: boolean;
  /** Screen focused and app foregrounded. */
  screenActive: boolean;
  muted: boolean;
  onToggleMute: () => void;
  /** Web refused autoplay with sound; the screen should flip to muted. */
  onAutoplayBlocked: () => void;
  /** Distance from the bottom edge to the top of the floating tab bar. */
  bottomSpace: number;
  rankLabel?: string;
}

interface Burst {
  id: number;
  x: number;
  y: number;
  tilt: number;
}

let burstSeq = 0;

/** One full-screen page of the "Untukmu" feed: looping EP 1 preview with overlay chrome. */
export function FeedItem({
  drama,
  width,
  height,
  active,
  preload,
  screenActive,
  muted,
  onToggleMute,
  onAutoplayBlocked,
  bottomSpace,
  rankLabel,
}: FeedItemProps) {
  const episode = useEpisode(drama.source, drama.id, preload ? 1 : undefined);
  const play = episode.data;
  const isFavorite = useIsFavorite(drama.source, drama.id);
  const history = useHistoryEntry(drama.source, drama.id);

  const [paused, setPaused] = useState(false);
  const [buffering, setBuffering] = useState(false);
  // Failure is tracked per URL so a refreshed (re-signed) URL gets a fresh attempt.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  // Bumped on recovery so the same URL string still gets a freshly mounted player.
  const [attempt, setAttempt] = useState(0);
  const [bursts, setBursts] = useState<Burst[]>([]);
  const progress = useSharedValue(0);
  // Subtitles follow the subtitle setting (no picker in the feed) and show once frames flow.
  const contentLang = useSettings((s) => s.contentLang);
  const subtitleLang = useSettings((s) => s.subtitleLang);
  const subtitle = pickSubtitle(play?.subtitles, null, subtitleLang, contentLang);
  const subtitleClock = useRef(createClock());
  const [started, setStarted] = useState(false);
  const [chromeHeight, setChromeHeight] = useState(0);

  // Leaving a page forgets a manual pause, so coming back always resumes the preview.
  const [wasActive, setWasActive] = useState(active);
  if (wasActive !== active) {
    setWasActive(active);
    if (!active) setPaused(false);
  }

  const videoFailed = !!play?.url && failedUrl === play.url;
  const fetchFailed = episode.isError;
  const playing = active && screenActive && !paused;
  const canPlay = preload && !!play && !play.locked && !!play.url && !videoFailed && !fetchFailed;

  // A preview on a dead server origin hangs inside the player: re-discover the server and refetch once.
  const { recovering, refresh, fail, reportProgress } = useStreamRecovery({
    refetch: episode.refetch,
    uri: play?.url ?? null,
    stalled: canPlay && playing && buffering,
    errored: active && (videoFailed || fetchFailed),
    onRecover: () => {
      setFailedUrl(null);
      setBuffering(false);
      setAttempt((n) => n + 1);
    },
    onGiveUp: () => {
      setBuffering(false);
      setFailedUrl(play?.url ?? null);
    },
  });
  const source = canPlay && !recovering && play ? { uri: play.url, type: play.type } : null;
  const unavailable = active && !recovering && (videoFailed || fetchFailed || (!!play && (play.locked || !play.url)));
  const loading = active && !unavailable && (!source || buffering);

  const clockRunning = !!source && playing && !buffering;
  useEffect(() => {
    updateClock(subtitleClock.current, { playing: clockRunning });
  }, [clockRunning]);

  const openDetail = () => router.push(dramaHref(drama));
  const openWatch = () => router.push(watchHref(drama.source, drama.id, history?.lastEpisode ?? 1));

  const toggleFavorite = () => {
    const added = useLibrary.getState().toggleFavorite(drama);
    if (added) {
      haptics.success();
      toast.show('Disimpan ke Daftarku', { variant: 'favorite' });
    } else {
      toast.show('Dihapus dari Daftarku', { icon: 'heart-dislike-outline' });
    }
  };

  const onDoubleTap = (x: number, y: number) => {
    setBursts((b) => [...b.slice(-3), { id: ++burstSeq, x, y, tilt: Math.round(Math.random() * 30 - 15) }]);
    haptics.light();
    if (!useLibrary.getState().isFavorite(drama.source, drama.id)) {
      useLibrary.getState().addFavorite(drama);
      toast.show('Disimpan ke Daftarku', { variant: 'favorite' });
    }
  };

  const removeBurst = useCallback((id: number) => setBursts((b) => b.filter((x) => x.id !== id)), []);

  const singleTap = Gesture.Tap()
    .maxDistance(12)
    .runOnJS(true)
    .onEnd((_e, success) => {
      if (success && active) setPaused((p) => !p);
    });
  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDelay(260)
    .maxDistance(20)
    .runOnJS(true)
    .onEnd((e, success) => {
      if (success) onDoubleTap(e.x, e.y);
    });
  const taps = Gesture.Exclusive(doubleTap, singleTap);

  const onProgress = (pos: number, dur: number) => {
    updateClock(subtitleClock.current, { pos });
    if (!started && pos > 0) setStarted(true);
    reportProgress(pos);
    const next = dur > 0 ? pos / dur : 0;
    // Loop restarts jump straight back; forward motion glides between ticks.
    if (next < progress.get()) progress.set(next);
    else progress.set(withTiming(next, { duration: 260, easing: Easing.linear }));
  };

  const onError = (e: VideoSurfaceError) => {
    if (e.autoplayBlocked) {
      onAutoplayBlocked();
      return;
    }
    // The preloaded neighbour must not spend the recovery or force pointer lookups: just mark it failed.
    if (!active) {
      setBuffering(false);
      setFailedUrl(play?.url ?? null);
      return;
    }
    fail(e.message);
  };

  const retry = () => {
    setFailedUrl(null);
    setAttempt((n) => n + 1);
    void refresh();
  };

  const ctaLabel = history ? `Lanjut EP ${history.lastEpisode}` : 'Tonton Drama Lengkap';

  return (
    <View style={[styles.page, { width, height }]}>
      {/* Stage: poster underlay + player. Taps here pause/like; overlay chrome sits above. */}
      {/* pan-y keeps native vertical scrolling alive on mobile web (RNGH defaults to touch-action: none). */}
      <GestureDetector gesture={taps} touchAction="pan-y" userSelect="none">
        <View style={StyleSheet.absoluteFill} accessible={false}>
          <PosterImage
            uri={drama.cover}
            aspectRatio={undefined}
            radius={0}
            transition={0}
            contentFit="contain"
            priority={active ? 'high' : 'normal'}
            style={StyleSheet.absoluteFill}
          />
          {source && (
            <VideoSurface
              key={attempt}
              source={source}
              cache={attempt === 0}
              playing={playing}
              muted={muted}
              loop
              contentFit="contain"
              poster={drama.cover}
              progressInterval={0.25}
              style={StyleSheet.absoluteFill}
              onProgress={onProgress}
              onBuffering={setBuffering}
              onError={onError}
            />
          )}
        </View>
      </GestureDetector>

      <LinearGradient
        pointerEvents="none"
        colors={gradients.videoBottom}
        locations={[0, 0.45, 1]}
        style={[styles.bottomScrim, { height: height * 0.55 }]}
      />

      {bursts.map((b) => (
        <HeartBurst key={b.id} id={b.id} x={b.x} y={b.y} tilt={b.tilt} onDone={removeBurst} />
      ))}

      {active && paused && (
        <View pointerEvents="none" style={styles.center}>
          <FadeIn rise={false} duration={160}>
            <GlassView style={styles.pausedGlyph} intensity={30}>
              <Ionicons name="play" size={34} color={onVideo.text} style={styles.playNudge} />
            </GlassView>
          </FadeIn>
        </View>
      )}

      {unavailable && (
        <View pointerEvents="box-none" style={styles.center}>
          <PressableScale onPress={retry} accessibilityLabel="Cuplikan tidak tersedia. Coba lagi">
            <GlassView style={styles.notice} intensity={40} tint={colors.glassStrong}>
              <Ionicons name="videocam-off-outline" size={18} color={onVideo.textDim} />
              <AppText variant="label" color={onVideo.text}>
                Cuplikan tidak tersedia
              </AppText>
              <AppText variant="label" color="primary">
                Coba lagi
              </AppText>
            </GlassView>
          </PressableScale>
        </View>
      )}

      {active && source && started && subtitle && (
        <SubtitleOverlay
          key={subtitle.url}
          url={subtitle.url}
          clock={subtitleClock}
          bottom={bottomSpace + spacing[3] + chromeHeight + spacing[3]}
        />
      )}

      <View
        pointerEvents="box-none"
        style={[styles.chrome, { bottom: bottomSpace + spacing[3] }]}
        onLayout={(e) => setChromeHeight(Math.round(e.nativeEvent.layout.height))}>
        <View pointerEvents="box-none" style={styles.row}>
          <View style={styles.info}>
            <FeedInfo drama={drama} rankLabel={rankLabel} onOpenDetail={openDetail} />
          </View>
          <FeedRail
            drama={drama}
            isFavorite={isFavorite}
            muted={muted}
            onToggleFavorite={toggleFavorite}
            onOpenDetail={openDetail}
            onShare={() => shareDrama(drama)}
            onToggleMute={onToggleMute}
          />
        </View>
        <GradientButton
          label={ctaLabel}
          icon="chevron-forward"
          iconPosition="right"
          fullWidth
          onPress={openWatch}
          style={styles.cta}
          accessibilityHint={`Putar ${drama.title} dari episode ${history?.lastEpisode ?? 1}`}
        />
      </View>

      {active && (
        <FeedProgress progress={progress} buffering={loading} style={[styles.progress, { bottom: bottomSpace }]} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { backgroundColor: colors.black, overflow: 'hidden' },
  bottomScrim: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  center: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pausedGlyph: {
    width: 76,
    height: 76,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassBorder,
  },
  playNudge: { marginLeft: 4, ...videoTextShadow },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    height: 44,
    paddingHorizontal: spacing[4],
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassBorder,
  },
  chrome: { position: 'absolute', left: layout.gutter, right: layout.gutter - spacing[2], gap: spacing[4] },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing[2] },
  info: { flex: 1, paddingBottom: spacing[1] },
  cta: { marginRight: spacing[2] },
  progress: { position: 'absolute', left: layout.gutter, right: layout.gutter },
});
