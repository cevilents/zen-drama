import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDetail } from '@/api/hooks';
import { BannerAd } from '@/components/ads/BannerAd';
import {
  DetailBackdrop,
  DetailCta,
  DetailHeader,
  DetailHero,
  DetailSkeleton,
  EpisodesSection,
  HEADER_BAR_HEIGHT,
  RecommendRow,
  Synopsis,
  posterSize,
} from '@/components/detail';
import { ErrorState } from '@/components/states/ErrorState';
import { FadeIn } from '@/components/ui/FadeIn';
import { useHistoryEntry } from '@/store';
import { colors, layout, spacing } from '@/theme';

export default function DramaDetailScreen() {
  const { source, id } = useLocalSearchParams<{ source: string; id: string }>();
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  const query = useDetail(source, id);
  const drama = query.data;
  const entry = useHistoryEntry(source, id);

  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.set(e.contentOffset.y);
  });

  const contentWidth = Math.min(windowWidth, layout.maxContentWidth);
  const topInset = insets.top + HEADER_BAR_HEIGHT + spacing[3];
  // The compact header title appears as the poster slides under the header.
  const posterHeight = posterSize(contentWidth).height;
  const showError = query.isError && !query.isFetching && !drama;

  return (
    <View style={styles.root}>
      <DetailBackdrop cover={drama?.cover} scrollY={scrollY} />

      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing[10] }}>
        <View style={styles.column}>
          {drama ? (
            <>
              <DetailHero drama={drama} topInset={topInset} contentWidth={contentWidth} />
              <FadeIn delay={160} style={styles.cta}>
                <DetailCta drama={drama} entry={entry} />
              </FadeIn>
              {!!drama.description.trim() && (
                <FadeIn delay={220} style={styles.section}>
                  <Synopsis text={drama.description} />
                </FadeIn>
              )}
              <BannerAd style={styles.banner} />
              <FadeIn delay={280} style={styles.episodes}>
                <EpisodesSection drama={drama} entry={entry} width={contentWidth - layout.gutter * 2} />
              </FadeIn>
              <FadeIn delay={340} style={styles.recommend}>
                <RecommendRow source={drama.source} excludeId={drama.id} lang={drama.lang ?? 'id'} />
              </FadeIn>
            </>
          ) : showError ? (
            <View style={[styles.error, { paddingTop: topInset, height: windowHeight * 0.8 }]}>
              <ErrorState error={query.error} onRetry={() => query.refetch()} />
            </View>
          ) : (
            <DetailSkeleton topInset={topInset} contentWidth={contentWidth} />
          )}
        </View>
      </Animated.ScrollView>

      <DetailHeader
        scrollY={scrollY}
        drama={drama}
        fadeStart={posterHeight * 0.7}
        fadeEnd={posterHeight + spacing[3]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  column: { width: '100%', maxWidth: layout.maxContentWidth, alignSelf: 'center' },
  cta: { paddingHorizontal: layout.gutter, marginTop: spacing[6] },
  section: { marginTop: spacing[8], paddingHorizontal: layout.gutter },
  banner: { marginTop: spacing[8], paddingHorizontal: layout.gutter },
  episodes: { marginTop: spacing[8] },
  recommend: { marginTop: spacing[8] },
  error: { justifyContent: 'center' },
});
