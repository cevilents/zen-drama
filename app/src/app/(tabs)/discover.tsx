import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useIsFocused, useNavigation } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Platform, StyleSheet, useWindowDimensions, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { flattenPages, useContentLang, useFeed, useList, useSources } from '@/api/hooks';
import {
  FeedPager,
  FeedSkeleton,
  FeedTopBar,
  onVideo,
  useAppActive,
  type FeedMode,
  type FeedPagerHandle,
} from '@/components/feed';
import { useTabBarSpace } from '@/components/navigation/useTabBarSpace';
import { EmptyState } from '@/components/states/EmptyState';
import { ErrorState } from '@/components/states/ErrorState';
import { AppText } from '@/components/ui/AppText';
import { FadeIn } from '@/components/ui/FadeIn';
import { GlassView } from '@/components/ui/GlassView';
import { PressableScale } from '@/components/ui/PressableScale';
import { colors, gradients, radii, spacing } from '@/theme';

/** Browsers block autoplay with sound until the user interacts, so web starts muted. */
const START_MUTED = Platform.OS === 'web';

export default function DiscoverScreen() {
  const insets = useSafeAreaInsets();
  const win = useWindowDimensions();
  const bottomSpace = useTabBarSpace(0);
  const isFocused = useIsFocused();
  const appActive = useAppActive();
  const navigation = useNavigation();
  const pagerRef = useRef<FeedPagerHandle>(null);

  const [mode, setMode] = useState<FeedMode>('foryou');
  const [muted, setMuted] = useState(START_MUTED);
  const [soundHintDismissed, setSoundHintDismissed] = useState(!START_MUTED);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const width = size?.width ?? win.width;
  const height = size?.height ?? win.height;

  const lang = useContentLang();
  const feed = useFeed();
  const sources = useSources();
  const trendingSource = sources.data?.find((s) => s.healthy)?.id;
  const trending = useList(mode === 'trending' ? trendingSource : undefined, 'trending');
  const query = mode === 'foryou' ? feed : trending;

  const items = useMemo(() => flattenPages(query.data), [query.data]);
  const noTrendingSource = mode === 'trending' && sources.isSuccess && !trendingSource;
  const pending = !noTrendingSource && items.length === 0 && (query.isPending || (mode === 'trending' && sources.isPending));
  const failed = mode === 'trending' && sources.isError ? sources.error : query.isError && items.length === 0 ? query.error : null;

  // Tab re-press while already on the feed: jump back to the first clip.
  useEffect(() => {
    // `tabPress` is emitted by the custom TabBar on the parent tab navigator.
    const unsubscribe = navigation.addListener('tabPress' as never, () => {
      if (navigation.isFocused()) pagerRef.current?.scrollToTop();
    });
    return unsubscribe;
  }, [navigation]);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width: w, height: h } = e.nativeEvent.layout;
    if (h > 0 && (w !== size?.width || h !== size?.height)) setSize({ width: w, height: h });
  };

  const toggleMute = () => {
    setMuted((m) => !m);
    setSoundHintDismissed(true);
  };

  const retry = () => {
    if (mode === 'trending' && sources.isError) sources.refetch();
    query.refetch();
  };

  let body: ReactNode;
  if (failed) {
    body = (
      <View style={[styles.state, { paddingTop: insets.top + 56, paddingBottom: bottomSpace }]}>
        <ErrorState error={failed} onRetry={retry} />
      </View>
    );
  } else if (noTrendingSource) {
    body = (
      <View style={[styles.state, { paddingTop: insets.top + 56, paddingBottom: bottomSpace }]}>
        <EmptyState
          icon="flame-outline"
          tone="gold"
          title="Trending belum tersedia"
          message="Semua sumber sedang tidak aktif. Coba lagi sebentar lagi atau lihat rekomendasi Untukmu."
          actionLabel="Lihat Untukmu"
          onAction={() => setMode('foryou')}
        />
      </View>
    );
  } else if (pending) {
    body = <FeedSkeleton height={height} bottomSpace={bottomSpace} />;
  } else if (items.length === 0) {
    body = (
      <View style={[styles.state, { paddingTop: insets.top + 56, paddingBottom: bottomSpace }]}>
        <EmptyState
          icon="film-outline"
          title="Belum ada cuplikan"
          message="Sumber drama belum mengirim rekomendasi. Tarik napas, lalu coba muat ulang."
          actionLabel="Muat ulang"
          actionIcon="refresh"
          onAction={retry}
        />
      </View>
    );
  } else {
    body = (
      <FeedPager
        // A language switch is a different catalog: start a fresh pager at the top.
        key={`${mode}:${lang}`}
        ref={pagerRef}
        items={items}
        width={width}
        height={height}
        focused={isFocused}
        screenActive={isFocused && appActive}
        muted={muted}
        onToggleMute={toggleMute}
        onAutoplayBlocked={() => setMuted(true)}
        hasMore={!!query.hasNextPage}
        fetchingMore={query.isFetchingNextPage}
        loadMoreError={query.isFetchNextPageError ? query.error : undefined}
        onLoadMore={() => query.fetchNextPage()}
        onRefresh={() => {
          pagerRef.current?.scrollToTop();
          query.refetch();
        }}
        bottomSpace={bottomSpace}
        ranked={mode === 'trending'}
      />
    );
  }

  const showSoundHint = muted && !soundHintDismissed && items.length > 0 && !failed;

  return (
    <View style={styles.root} onLayout={onLayout}>
      {body}

      <LinearGradient
        pointerEvents="none"
        colors={gradients.videoTop}
        style={[styles.topScrim, { height: insets.top + 110 }]}
      />
      <FeedTopBar mode={mode} onChange={setMode} onSearch={() => router.navigate('/search')} top={insets.top} />

      {showSoundHint && (
        <View pointerEvents="box-none" style={[styles.hintWrap, { top: insets.top + 60 }]}>
          <FadeIn delay={600}>
            <PressableScale onPress={toggleMute} haptic="light" accessibilityLabel="Nyalakan suara">
              <GlassView style={styles.hint} intensity={40} tint={colors.glassStrong}>
                <Ionicons name="volume-mute" size={16} color={onVideo.text} />
                <AppText variant="label" color={onVideo.text}>
                  Ketuk untuk menyalakan suara
                </AppText>
              </GlassView>
            </PressableScale>
          </FadeIn>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.black },
  state: { flex: 1, backgroundColor: colors.bg },
  topScrim: { position: 'absolute', top: 0, left: 0, right: 0 },
  hintWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  hint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    height: 36,
    paddingHorizontal: spacing[4],
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassBorder,
  },
});
