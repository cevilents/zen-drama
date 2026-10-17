import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Text as SvgText } from 'react-native-svg';

import { flattenPages, useHome, useList } from '@/api/hooks';
import type { Drama } from '@/api/types';
import { PosterImage } from '@/components/drama/PosterImage';
import { storyTags } from '@/components/home/meta';
import { AppText } from '@/components/ui/AppText';
import { PressableScale } from '@/components/ui/PressableScale';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatViews } from '@/lib/format';
import { dramaHref } from '@/lib/routes';
import { colors, fonts, gradients, radii, spacing } from '@/theme';

import { SearchSectionTitle } from './SearchSectionTitle';

const LIMIT = 10;

/** Top 10 from the home "rank" section (already cached), topped up from rows; list endpoint as fallback. */
function useTrending(): { items: Drama[]; loading: boolean } {
  const home = useHome();
  const fallback = useList(home.isError && !home.data ? 'reelshort' : undefined, 'trending');

  const items = useMemo(() => {
    const sections = home.data?.sections ?? [];
    const pool = [
      ...(sections.find((s) => s.style === 'rank')?.items ?? []),
      ...sections.filter((s) => s.style === 'row').flatMap((s) => s.items),
      ...flattenPages(fallback.data),
    ];
    const seen = new Set<string>();
    const out: Drama[] = [];
    for (const d of pool) {
      const k = `${d.source}:${d.id}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(d);
      if (out.length >= LIMIT) break;
    }
    return out;
  }, [home.data, fallback.data]);

  return { items, loading: home.isPending || (home.isError && !home.data && fallback.isPending) };
}

/** "Sedang Trending": numbered compact list, gold numerals for the top three. */
export function TrendingList() {
  const { items, loading } = useTrending();
  if (!loading && !items.length) return null;

  return (
    <View>
      <SearchSectionTitle title="Sedang Trending" icon="trending-up" iconColor={colors.gold} />
      <View style={styles.list}>
        {loading
          ? Array.from({ length: 5 }).map((_, i) => <TrendingSkeleton key={i} />)
          : items.map((d, i) => <TrendingItem key={`${d.source}:${d.id}`} drama={d} rank={i + 1} />)}
      </View>
    </View>
  );
}

const TrendingItem = memo(function TrendingItem({ drama, rank }: { drama: Drama; rank: number }) {
  const meta = [
    ...storyTags(drama, 1),
    drama.totalEpisodes > 0 ? `${drama.totalEpisodes} EP` : null,
    drama.viewCount > 0 ? `${formatViews(drama.viewCount)} ditonton` : null,
  ].filter(Boolean) as string[];

  return (
    <PressableScale
      onPress={() => router.push(dramaHref(drama))}
      activeScale={0.98}
      accessibilityLabel={`Peringkat ${rank}, ${drama.title}`}
      accessibilityHint="Buka detail drama"
      style={styles.item}>
      <RankNumber rank={rank} />
      <PosterImage uri={drama.cover} style={styles.poster} radius={radii.sm} accessibilityLabel={drama.title} />
      <View style={styles.body}>
        <AppText variant="title" numberOfLines={2}>
          {drama.title}
        </AppText>
        {meta.length > 0 && (
          <AppText variant="caption" color="textMuted" numberOfLines={1}>
            {meta.join(' · ')}
          </AppText>
        )}
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
    </PressableScale>
  );
});

function RankNumber({ rank }: { rank: number }) {
  const top = rank <= 3;
  const [from, to] = gradients.gold;
  return (
    <View style={styles.rank} aria-hidden>
      <Svg width={30} height={30}>
        <Defs>
          <LinearGradient id={`trendGold${rank}`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={from} />
            <Stop offset="1" stopColor={to} />
          </LinearGradient>
        </Defs>
        <SvgText
          x={15}
          y={23}
          textAnchor="middle"
          fontFamily={fonts.extrabold}
          fontWeight="800"
          fontSize={22}
          letterSpacing={-1}
          fill={top ? `url(#trendGold${rank})` : colors.textMuted}>
          {String(rank)}
        </SvgText>
      </Svg>
    </View>
  );
}

function TrendingSkeleton() {
  return (
    <View style={styles.item}>
      <Skeleton width={22} height={22} radius={radii.xs} style={styles.skRank} />
      <Skeleton width={52} aspectRatio={3 / 4} radius={radii.sm} />
      <View style={styles.body}>
        <Skeleton height={14} width="80%" radius={radii.xs} />
        <Skeleton height={11} width="45%" radius={radii.xs} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing[1] },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingVertical: spacing[1.5],
  },
  rank: { width: 30, alignItems: 'center' },
  skRank: { marginHorizontal: 4 },
  poster: { width: 52 },
  body: { flex: 1, gap: spacing[1] },
});
