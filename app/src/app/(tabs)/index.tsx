import { router, useIsFocused } from 'expo-router';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Platform, RefreshControl, StyleSheet, useWindowDimensions, View, type ListRenderItem } from 'react-native';
import Animated, { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useHome } from '@/api/hooks';
import type { Drama, Section } from '@/api/types';
import { BannerAd } from '@/components/ads/BannerAd';
import { SectionHeader } from '@/components/drama/SectionHeader';
import { ContinueRow } from '@/components/home/ContinueRow';
import { DramaRow } from '@/components/home/DramaRow';
import { GenreRail } from '@/components/home/GenreRail';
import { HeroCarousel } from '@/components/home/HeroCarousel';
import { HomeSkeleton } from '@/components/home/HomeSkeleton';
import { HomeTopBar, TOP_BAR_HEIGHT } from '@/components/home/HomeTopBar';
import { browseHref, sectionIcon, sectionToList } from '@/components/home/meta';
import { chunk, GRID_GAP, PosterGridRow } from '@/components/home/PosterGridRow';
import { useQuickActions } from '@/components/home/QuickActionsSheet';
import { RankRow } from '@/components/home/RankRow';
import { useTabBarSpace } from '@/components/navigation/useTabBarSpace';
import { ErrorState } from '@/components/states/ErrorState';
import { AppText } from '@/components/ui/AppText';
import { FadeIn } from '@/components/ui/FadeIn';
import { toast } from '@/store';
import { colors, layout, spacing } from '@/theme';

type Block =
  | { kind: 'continue'; key: string }
  | { kind: 'rank'; key: string; section: Section }
  | { kind: 'genres'; key: string }
  | { kind: 'banner'; key: string }
  | { kind: 'row'; key: string; section: Section; order: number }
  | { kind: 'gridHeader'; key: string; title: string }
  | { kind: 'gridRow'; key: string; items: Drama[] };

const SECTION_GAP = spacing[8];
const GRID_COLUMNS = 3;

function buildBlocks(sections: Section[]): Block[] {
  const blocks: Block[] = [{ kind: 'continue', key: 'continue' }];
  let rowOrder = 0;
  let genresPlaced = false;
  const placeGenres = () => {
    if (genresPlaced) return;
    genresPlaced = true;
    blocks.push({ kind: 'genres', key: 'genres' });
    blocks.push({ kind: 'banner', key: 'banner' });
  };

  for (const s of sections) {
    if (s.style === 'hero' || !s.items.length) continue;
    if (s.style === 'rank') {
      blocks.push({ kind: 'rank', key: s.key, section: s });
    } else if (s.style === 'row') {
      blocks.push({ kind: 'row', key: s.key, section: s, order: rowOrder++ });
      // Break the run of poster rows with the genre rail after the first two.
      if (rowOrder === 2) placeGenres();
    } else if (s.style === 'grid') {
      placeGenres();
      blocks.push({ kind: 'gridHeader', key: `${s.key}:header`, title: s.title });
      // Drop an orphan last row so the grid ends on a full line.
      const full = s.items.length >= GRID_COLUMNS ? s.items.length - (s.items.length % GRID_COLUMNS) : s.items.length;
      chunk(s.items.slice(0, full), GRID_COLUMNS).forEach((items, i) => {
        blocks.push({ kind: 'gridRow', key: `${s.key}:${i}`, items });
      });
    }
  }
  placeGenres();
  return blocks;
}

const keyOf = (b: Block) => b.key;

export default function HomeScreen() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const tabBarSpace = useTabBarSpace(spacing[6]);
  const focused = useIsFocused();
  const home = useHome();
  const { open: openQuick, sheet } = useQuickActions();
  const [refreshing, setRefreshing] = useState(false);

  const heroHeight = Math.round(Math.min(Math.max(height * 0.62, 460), 640));
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.set(e.contentOffset.y);
  });

  const sections = home.data?.sections;
  const heroItems = useMemo(() => sections?.find((s) => s.style === 'hero')?.items ?? [], [sections]);
  const blocks = useMemo(() => (sections ? buildBlocks(sections) : []), [sections]);
  const hasHero = heroItems.length > 0;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    const res = await home.refetch();
    setRefreshing(false);
    if (res.isError && res.data) toast.error('Gagal memperbarui. Menampilkan data terakhir.');
  }, [home]);

  const renderItem = useCallback<ListRenderItem<Block>>(
    ({ item }) => {
      switch (item.kind) {
        case 'continue':
          return <ContinueRow style={styles.section} />;
        case 'rank':
          return <RankRow title={item.section.title} items={item.section.items} style={styles.section} />;
        case 'genres':
          return <GenreRail style={styles.section} />;
        case 'banner':
          return <BannerAd style={styles.section} />;
        case 'row': {
          const { section, order } = item;
          const list = sectionToList(section.key);
          const lead = order === 0;
          return (
            <DramaRow
              title={section.title}
              icon={sectionIcon(section.key)}
              items={section.items}
              cardWidth={lead ? 136 : 116}
              showMeta={lead}
              badge={section.key.endsWith('latest') ? 'new' : null}
              onSeeAll={list ? () => router.push(browseHref(list.source, list.type)) : undefined}
              onLongPress={openQuick}
              style={styles.section}
            />
          );
        }
        case 'gridHeader':
          return (
            <SectionHeader
              title={item.title}
              icon="apps"
              subtitle="Semua drama pilihan dari berbagai sumber"
              style={[styles.section, styles.gridHeader]}
            />
          );
        case 'gridRow':
          return <PosterGridRow items={item.items} columns={GRID_COLUMNS} onLongPress={openQuick} style={styles.gridRow} />;
      }
    },
    [openQuick],
  );

  const header = hasHero ? (
    <HeroCarousel
      items={heroItems}
      width={width}
      height={heroHeight}
      scrollY={scrollY}
      active={focused}
      onLongPress={openQuick}
    />
  ) : (
    <View style={{ height: insets.top + TOP_BAR_HEIGHT }} />
  );

  const footer = (
    <View style={[styles.footer, { paddingBottom: tabBarSpace }]}>
      <View style={styles.footerRule} />
      <AppText variant="caption" color="textMuted" align="center">
        Kamu sudah sampai di bawah · Tarik ke bawah untuk menyegarkan
      </AppText>
    </View>
  );

  const searchFocused = () => router.push({ pathname: '/search', params: { focus: String(Date.now()) } });

  let body: ReactNode;
  if (home.isPending) {
    body = <HomeSkeleton heroHeight={heroHeight} />;
  } else if (home.isError && !home.data) {
    body = (
      <View style={[styles.error, { paddingTop: insets.top + TOP_BAR_HEIGHT, paddingBottom: tabBarSpace }]}>
        <ErrorState error={home.error} onRetry={() => home.refetch()} />
      </View>
    );
  } else {
    body = (
      <Animated.FlatList
        data={blocks}
        keyExtractor={keyOf}
        renderItem={renderItem}
        ListHeaderComponent={header}
        ListFooterComponent={footer}
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        initialNumToRender={4}
        maxToRenderPerBatch={4}
        windowSize={7}
        removeClippedSubviews={Platform.OS !== 'web'}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
            progressBackgroundColor={colors.surface}
            progressViewOffset={insets.top + TOP_BAR_HEIGHT}
          />
        }
      />
    );
  }

  return (
    <View style={styles.root}>
      <FadeIn rise={false} style={styles.root} key={home.isPending ? 'loading' : 'ready'}>
        {body}
      </FadeIn>
      <HomeTopBar scrollY={scrollY} solidAt={hasHero ? heroHeight - insets.top - TOP_BAR_HEIGHT : 1} onSearch={searchFocused} />
      {sheet}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  section: { marginTop: SECTION_GAP },
  gridHeader: { marginBottom: spacing[3] },
  gridRow: { marginBottom: GRID_GAP + spacing[2] },
  error: { flex: 1 },
  footer: { paddingTop: spacing[8], paddingHorizontal: layout.gutter, alignItems: 'center', gap: spacing[3] },
  footerRule: { width: 32, height: 3, borderRadius: 2, backgroundColor: colors.borderStrong },
});
