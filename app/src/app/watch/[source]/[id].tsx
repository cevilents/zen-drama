import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type ListRenderItemInfo,
  type ViewToken,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDetail, useEpisode, usePrefetchEpisode } from '@/api/hooks';
import { PosterImage } from '@/components/drama/PosterImage';
import { ActiveEpisode } from '@/components/player/ActiveEpisode';
import { EpisodeGate } from '@/components/player/EpisodeGate';
import { EpisodePoster } from '@/components/player/EpisodePoster';
import { EpisodeSheet } from '@/components/player/EpisodeSheet';
import { PlaybackSheet } from '@/components/player/PlaybackSheet';
import type { SubtitleChoice } from '@/components/player/pickSubtitle';
import { PlayerToast, type PlayerNotice } from '@/components/player/PlayerToast';
import { PlayerTopBar } from '@/components/player/PlayerTopBar';
import { SoundPill } from '@/components/player/SoundPill';
import { WebPagerArrows } from '@/components/player/WebPagerArrows';
import { ErrorState } from '@/components/states/ErrorState';
import { IconButton } from '@/components/ui/IconButton';
import { episodeCount } from '@/lib/format';
import { dramaHref } from '@/lib/routes';
import { isOwner } from '@/lib/owner';
import { isGated, unlockEpisode } from '@/lib/unlock';
import { colors, layout, spacing } from '@/theme';

type Size = { width: number; height: number };
type Sheet = 'episodes' | 'settings' | null;

export default function WatchScreen() {
  const { source, id, ep } = useLocalSearchParams<{ source: string; id: string; ep?: string }>();
  const initialEp = Math.max(1, Math.floor(Number(ep)) || 1);
  const insets = useSafeAreaInsets();

  const detail = useDetail(source, id);
  const prefetch = usePrefetchEpisode();
  const drama = detail.data;
  // Trust the drama's own count; fall back to the requested episode only when the source reports none.
  const known = drama ? episodeCount(drama) : 0;
  const total = drama ? known || initialEp : 0;

  const [size, setSize] = useState<Size | null>(null);
  const [activeIndex, setActiveIndex] = useState(initialEp - 1);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [muted, setMuted] = useState(false);
  const [soundBlocked, setSoundBlocked] = useState(false);
  const [scrubbing, setScrubbing] = useState(false);
  const [episodeEnded, setEpisodeEnded] = useState(false);
  const [unlockTick, setUnlockTick] = useState(0);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [notice, setNotice] = useState<PlayerNotice | null>(null);
  // Subtitle picked in the playback sheet; holds for every episode of this watch session.
  const [subtitleChoice, setSubtitleChoice] = useState<SubtitleChoice | null>(null);
  const listRef = useRef<FlatList<number>>(null);

  // `?ep=999` on a 40-episode drama lands on the last episode.
  const index = total > 0 ? Math.min(Math.max(activeIndex, 0), total - 1) : 0;
  const activeEp = index + 1;
  // Shares the cache entry with the live page; used for the quality picker.
  const activeQuery = useEpisode(source, id, drama ? activeEp : undefined);

  // Start fetching the stream in parallel with the drama detail.
  useEffect(() => {
    if (source && id) prefetch(source, id, initialEp);
  }, [prefetch, source, id, initialEp]);

  const [viewability] = useState(() => [
    {
      viewabilityConfig: { itemVisiblePercentThreshold: 75 },
      onViewableItemsChanged: ({ viewableItems }: { viewableItems: ViewToken<number>[] }) => {
        const visible = viewableItems.find((v) => v.isViewable && v.index != null);
        if (visible?.index != null) setActiveIndex(visible.index);
      },
    },
  ]);

  const close = () => {
    if (router.canGoBack()) router.back();
    else if (source && id) router.replace(dramaHref({ source, id }));
    else router.replace('/');
  };

  const goTo = useCallback(
    (target: number, animated = true) => {
      if (target < 0 || target >= total) return;
      setActiveIndex(target);
      setControlsVisible(true);
      // The scrubber may unmount mid-drag with the old page; never carry a locked pager over.
      setScrubbing(false);
      listRef.current?.scrollToIndex({ index: target, animated });
    },
    [total],
  );

  const notify = useCallback((n: Omit<PlayerNotice, 'id'>) => setNotice({ ...n, id: Date.now() }), []);
  const hideNotice = useCallback(() => setNotice(null), []);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (!size || size.width !== width || size.height !== height) setSize({ width, height });
  };

  // Web: ↑/↓ switch episodes, M toggles sound.
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (sheet || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
    if (e.key === 'ArrowDown' || e.key === 'PageDown') {
      e.preventDefault();
      goTo(index + 1);
    } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
      e.preventDefault();
      goTo(index - 1);
    } else if ((e.key === 'm' || e.key === 'M') && !e.repeat) {
      setMuted(!muted);
      setSoundBlocked(false);
    }
  });
  // Web: one wheel/trackpad flick = one episode (native scroll-snap overshoots or snaps back).
  const wheel = useRef({ acc: 0, lockUntil: 0 });
  const onWheel = useEffectEvent((e: WheelEvent) => {
    // ctrl+wheel is the browser's (and trackpad pinch) zoom gesture.
    if (sheet || e.ctrlKey) return;
    e.preventDefault();
    const now = Date.now();
    const w = wheel.current;
    if (now < w.lockUntil) {
      // Keep swallowing trackpad inertia until it settles.
      w.lockUntil = now + 220;
      return;
    }
    w.acc += e.deltaY;
    if (Math.abs(w.acc) >= 40) {
      goTo(index + (w.acc > 0 ? 1 : -1));
      w.acc = 0;
      w.lockUntil = now + 500;
    }
  });

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const keyHandler = (e: KeyboardEvent) => onKey(e);
    const wheelHandler = (e: WheelEvent) => onWheel(e);
    window.addEventListener('keydown', keyHandler);
    window.addEventListener('wheel', wheelHandler, { passive: false });
    return () => {
      window.removeEventListener('keydown', keyHandler);
      window.removeEventListener('wheel', wheelHandler);
    };
  }, []);

  // --- layout -------------------------------------------------------------------------------
  const isWide = !!size && size.width > size.height * 0.75;
  const stageW = size ? (isWide ? Math.round((size.height * 9) / 16) : size.width) : 0;
  const pageH = size?.height ?? 0;
  const topInset = isWide ? spacing[2] : insets.top;
  const episodes = Array.from({ length: total }, (_, i) => i + 1);

  // Page height changed (web resize, rotation, narrow ↔ wide stage): snap back onto the active page.
  const realign = useEffectEvent((h: number) => {
    listRef.current?.scrollToOffset({ offset: index * h, animated: false });
  });
  useEffect(() => {
    if (pageH > 0) realign(pageH);
  }, [pageH]);

  const renderItem = ({ item, index: itemIndex }: ListRenderItemInfo<number>) => {
    if (!drama) return null;
    const dramaKey = `${drama.source}:${drama.id}`;
    if (itemIndex === index) {
      // Web-only: gated episodes stop at a "watch ad / wait" card instead of mounting the player.
      if (Platform.OS === 'web' && !isOwner() && isGated(dramaKey, item)) {
        return (
          <EpisodeGate
            key={`gate-${item}`}
            dramaKey={dramaKey}
            episode={item}
            width={stageW}
            height={pageH}
            onUnlock={() => {
              unlockEpisode(dramaKey, item);
              setUnlockTick((t) => t + 1);
            }}
          />
        );
      }
      return (
        <ActiveEpisode
          key={item}
          drama={drama}
          episode={item}
          total={total}
          width={stageW}
          height={pageH}
          // Whole frame always visible: phones are taller than 9:16, so "cover" cropped the sides.
          contentFit="contain"
          ignoreInsets={isWide}
          controlsVisible={controlsVisible}
          setControlsVisible={setControlsVisible}
          muted={muted}
          onAutoplayBlocked={() => {
            setMuted(true);
            setSoundBlocked(true);
          }}
          onRequestNext={() => goTo(itemIndex + 1)}
          onScrubbingChange={setScrubbing}
          keyboardEnabled={!sheet}
          onEndedChange={setEpisodeEnded}
          onOpenEpisodes={() => setSheet('episodes')}
          onOpenSettings={() => setSheet('settings')}
          onNotify={notify}
          onClose={close}
          subtitleChoice={subtitleChoice}
        />
      );
    }
    return (
      <EpisodePoster
        poster={drama.episodes[itemIndex]?.thumb || drama.cover}
        title={drama.title}
        episode={item}
        total={total}
        synopsis={drama.description}
        width={stageW}
        height={pageH}
        ignoreInsets={isWide}
      />
    );
  };

  return (
    <View style={styles.root} onLayout={onLayout}>
      <StatusBar hidden style="light" />

      {isWide && size && drama?.cover ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <PosterImage uri={drama.cover} aspectRatio={size.width / size.height} radius={0} blurRadius={40} style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, styles.wideScrim]} />
        </View>
      ) : null}

      {size && drama && total > 0 ? (
        <View style={[styles.stage, { width: stageW, height: pageH }]}>
          <FlatList
            ref={listRef}
            data={episodes}
            keyExtractor={(n) => String(n)}
            renderItem={renderItem}
            extraData={[index, controlsVisible, muted, stageW, pageH, isWide, sheet, unlockTick, subtitleChoice]}
            getItemLayout={(_, index) => ({ length: pageH, offset: pageH * index, index })}
            initialScrollIndex={index}
            pagingEnabled
            scrollEnabled={!scrubbing}
            showsVerticalScrollIndicator={false}
            decelerationRate="fast"
            bounces={false}
            overScrollMode="never"
            windowSize={3}
            initialNumToRender={1}
            maxToRenderPerBatch={2}
            // Off on Android: clipping/unclipping the active page's video TextureView as it scrolls
            // corrupts/leaks ExoPlayer surfaces, which wedges playback after a few episode switches.
            removeClippedSubviews={false}
            viewabilityConfigCallbackPairs={viewability}
            onScrollToIndexFailed={({ index }) => {
              setTimeout(() => listRef.current?.scrollToIndex({ index, animated: false }), 60);
            }}
          />

          <PlayerTopBar
            title={drama.title}
            episode={activeEp}
            total={total}
            visible={controlsVisible}
            topInset={topInset}
            onClose={close}
            onMore={() => setSheet('settings')}
          />
          {soundBlocked && muted && (
            <SoundPill
              top={topInset + 64}
              onPress={() => {
                setMuted(false);
                setSoundBlocked(false);
              }}
            />
          )}
          <PlayerToast notice={notice} onHide={hideNotice} top={topInset + (soundBlocked && muted ? 112 : 64)} />
        </View>
      ) : (
        <View style={[styles.center, { paddingTop: insets.top }]}>
          {detail.isError ? (
            <ErrorState error={detail.error} onRetry={() => detail.refetch()} />
          ) : (
            <>
              {drama?.cover ? (
                <PosterImage
                  uri={drama.cover}
                  aspectRatio={size ? size.width / size.height : 9 / 16}
                  radius={0}
                  style={[StyleSheet.absoluteFill, styles.loadingPoster]}
                />
              ) : null}
              <ActivityIndicator size="large" color={colors.white} />
            </>
          )}
          <View style={[styles.loadingTop, { top: insets.top + spacing[2] }]}>
            <IconButton icon="chevron-down" iconSize={24} accessibilityLabel="Tutup pemutar" onPress={close} />
          </View>
        </View>
      )}

      {Platform.OS === 'web' && size && drama && total > 1 && !episodeEnded && (
        <WebPagerArrows
          visible={controlsVisible}
          canPrev={index > 0}
          canNext={index < total - 1}
          onPrev={() => goTo(index - 1)}
          onNext={() => goTo(index + 1)}
          style={
            isWide
              ? { left: (size.width + stageW) / 2 + spacing[5], top: pageH / 2 - 52 }
              : { right: spacing[2], top: pageH * 0.36 }
          }
        />
      )}

      {drama && (
        <>
          <EpisodeSheet
            visible={sheet === 'episodes'}
            onClose={() => setSheet(null)}
            drama={drama}
            total={total}
            currentEp={activeEp}
            onSelect={(n) => {
              setSheet(null);
              goTo(n - 1, false);
            }}
          />
          <PlaybackSheet
            visible={sheet === 'settings'}
            onClose={() => setSheet(null)}
            qualities={activeQuery.data?.qualities ?? []}
            subtitles={activeQuery.data?.subtitles ?? []}
            subtitleChoice={subtitleChoice}
            onSubtitleChoice={setSubtitleChoice}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.black, alignItems: 'center', overflow: 'hidden' },
  stage: { overflow: 'hidden', backgroundColor: colors.black },
  wideScrim: { backgroundColor: 'rgba(0,0,0,0.58)' },
  center: { flex: 1, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  loadingPoster: { opacity: 0.35 },
  loadingTop: { position: 'absolute', left: layout.gutter - 4 },
});
