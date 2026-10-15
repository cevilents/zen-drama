import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, FlatList, Platform, RefreshControl, ScrollView, StyleSheet, useWindowDimensions, View, type ListRenderItem } from 'react-native';
import Animated, { Extrapolation, interpolate, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { flattenPages, useList, useSources } from '@/api/hooks';
import type { Drama } from '@/api/types';
import { DramaCard } from '@/components/drama/DramaCard';
import { browseHref, isListType, LIST_ICONS, LIST_TITLES, LIST_TYPES } from '@/components/home/meta';
import { GRID_GAP } from '@/components/home/PosterGridRow';
import { useQuickActions } from '@/components/home/QuickActionsSheet';
import { EmptyState } from '@/components/states/EmptyState';
import { ErrorState } from '@/components/states/ErrorState';
import { LoadingGrid } from '@/components/states/Loading';
import { AppText } from '@/components/ui/AppText';
import { Chip } from '@/components/ui/Chip';
import { GlassView } from '@/components/ui/GlassView';
import { GradientButton } from '@/components/ui/GradientButton';
import { IconButton } from '@/components/ui/IconButton';
import { toast } from '@/store';
import { colors, layout, spacing } from '@/theme';

const COLUMNS = 3;
const AnimatedFlatList = Animated.createAnimatedComponent(FlatList<Drama>);

const keyOf = (d: Drama) => `${d.source}:${d.id}`;

function prettySource(id: string): string {
  return id ? id.charAt(0).toUpperCase() + id.slice(1) : '';
}

export default function BrowseScreen() {
  const params = useLocalSearchParams<{ source: string; type: string }>();
  const source = params.source ?? '';
  const type = isListType(params.type) ? params.type : null;
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const cellWidth = Math.floor((windowWidth - layout.gutter * 2 - GRID_GAP * (COLUMNS - 1)) / COLUMNS);
  const sources = useSources();
  // Sources without content in the current language are left out of /api/sources?lang=.
  const unavailable = !!sources.data && !sources.data.some((s) => s.id === source);
  const list = useList(type && !unavailable ? source : undefined, type ?? 'trending');
  const { open: openQuick, sheet } = useQuickActions();
  const [refreshing, setRefreshing] = useState(false);

  const items = useMemo(() => flattenPages(list.data), [list.data]);
  const healthy = useMemo(() => (sources.data ?? []).filter((s) => s.healthy), [sources.data]);
  const sourceName = sources.data?.find((s) => s.id === source)?.name ?? prettySource(source);
  const title = type ? LIST_TITLES[type] : 'Jelajahi';

  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.set(e.contentOffset.y);
  });
  const headerBg = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.get(), [0, 24], [0, 1], Extrapolation.CLAMP),
  }));

  const switchTo = (next: { source?: string; type?: string }) => {
    const s = next.source ?? source;
    const t = next.type ?? type;
    if (!isListType(t) || (s === source && t === type)) return;
    scrollY.set(0);
    router.setParams({ source: s, type: t });
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    const res = await list.refetch();
    setRefreshing(false);
    if (res.isError) toast.error('Gagal memperbarui. Menampilkan data terakhir.');
  }, [list]);

  const onEndReached = () => {
    if (list.hasNextPage && !list.isFetchingNextPage && !list.isFetchNextPageError) list.fetchNextPage();
  };

  const renderItem = useCallback<ListRenderItem<Drama>>(
    ({ item }) => (
      <View style={{ width: cellWidth }}>
        <DramaCard drama={item} showMeta badge={null} onLongPress={openQuick} />
      </View>
    ),
    [openQuick, cellWidth],
  );

  const showSkeleton = list.isPending || list.isPlaceholderData;

  let content: ReactNode;
  if (!type) {
    content = (
      <EmptyState
        icon="compass-outline"
        title="Daftar tidak dikenal"
        message="Halaman ini tidak tersedia. Coba buka daftar trending."
        actionLabel="Buka Trending"
        onAction={() => router.replace(browseHref(source || 'reelshort', 'trending'))}
      />
    );
  } else if (unavailable) {
    content = (
      <EmptyState
        icon="language-outline"
        tone="muted"
        title="Sumber tidak tersedia"
        message={`${sourceName} tidak punya konten dalam bahasa yang dipilih. Pilih sumber lain atau ganti bahasa konten di Pengaturan.`}
      />
    );
  } else if (showSkeleton) {
    content = <LoadingGrid columns={COLUMNS} rows={4} gap={GRID_GAP} style={styles.skeleton} />;
  } else if (list.isError && !items.length) {
    content = <ErrorState error={list.error} onRetry={() => list.refetch()} />;
  } else if (!items.length) {
    content = (
      <EmptyState
        icon="film-outline"
        tone="muted"
        title="Belum ada drama"
        message={`${sourceName} belum punya daftar ${title.toLowerCase()} saat ini. Coba sumber lain.`}
      />
    );
  } else {
    content = (
      <AnimatedFlatList
        data={items}
        keyExtractor={keyOf}
        renderItem={renderItem}
        numColumns={COLUMNS}
        columnWrapperStyle={styles.columns}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + spacing[8] }]}
        onScroll={onScroll}
        scrollEventThrottle={16}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.6}
        initialNumToRender={12}
        maxToRenderPerBatch={9}
        windowSize={9}
        removeClippedSubviews={Platform.OS !== 'web'}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
            progressBackgroundColor={colors.surface}
          />
        }
        ListHeaderComponent={
          <AppText variant="caption" color="textMuted" style={styles.count}>
            {items.length}
            {list.hasNextPage ? '+' : ''} drama · tahan poster untuk aksi cepat
          </AppText>
        }
        ListFooterComponent={
          <View style={styles.footer}>
            {list.isFetchingNextPage ? (
              <ActivityIndicator color={colors.primary} />
            ) : list.isFetchNextPageError ? (
              <GradientButton
                label="Gagal memuat. Coba lagi"
                icon="refresh"
                variant="secondary"
                size="md"
                onPress={() => list.fetchNextPage()}
              />
            ) : !list.hasNextPage ? (
              <AppText variant="caption" color="textMuted" align="center">
                Sudah semua · {items.length} drama
              </AppText>
            ) : null}
          </View>
        }
      />
    );
  }

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, headerBg]}>
          <GlassView style={StyleSheet.absoluteFill} intensity={50} tint="rgba(7,7,10,0.86)" />
          <View style={styles.hairline} />
        </Animated.View>

        <View style={styles.titleRow}>
          <IconButton
            icon="chevron-back"
            accessibilityLabel="Kembali"
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          />
          <View style={styles.titleText}>
            <View style={styles.titleLine}>
              {type && <IconGlyph type={type} />}
              <AppText variant="h2" numberOfLines={1} accessibilityRole="header" style={styles.flexShrink}>
                {title}
              </AppText>
            </View>
            {!!sourceName && (
              <AppText variant="caption" color="textSecondary" numberOfLines={1}>
                dari {sourceName}
              </AppText>
            )}
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}>
          {LIST_TYPES.map((t) => (
            <Chip
              key={t}
              label={LIST_TITLES[t]}
              icon={LIST_ICONS[t]}
              size="sm"
              selected={t === type}
              onPress={() => switchTo({ type: t })}
            />
          ))}
        </ScrollView>
        {healthy.length > 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[styles.chips, styles.sourceChips]}>
            {healthy.map((s) => (
              <Chip
                key={s.id}
                label={s.name}
                size="sm"
                selected={s.id === source}
                onPress={() => switchTo({ source: s.id })}
              />
            ))}
          </ScrollView>
        )}
      </View>

      <View style={styles.body}>{content}</View>
      {sheet}
    </View>
  );
}

function IconGlyph({ type }: { type: keyof typeof LIST_ICONS }) {
  return <Ionicons name={LIST_ICONS[type]} size={18} color={type === 'trending' ? colors.primary : colors.gold} />;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { zIndex: 2, paddingBottom: spacing[3] },
  hairline: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingHorizontal: layout.gutter,
    paddingTop: spacing[2],
    paddingBottom: spacing[3],
  },
  titleText: { flex: 1 },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: spacing[1] },
  flexShrink: { flexShrink: 1 },
  chips: { paddingHorizontal: layout.gutter, gap: spacing[2] },
  sourceChips: { paddingTop: spacing[2] },
  body: { flex: 1 },
  skeleton: { paddingTop: spacing[4] },
  listContent: { paddingHorizontal: layout.gutter, paddingTop: spacing[2] },
  columns: { gap: GRID_GAP, marginBottom: spacing[4] },
  count: { marginBottom: spacing[3] },
  footer: { paddingVertical: spacing[6], alignItems: 'center', minHeight: 72 },
});
