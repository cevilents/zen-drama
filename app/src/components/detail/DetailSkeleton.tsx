import { StyleSheet, View } from 'react-native';

import { Skeleton } from '@/components/ui/Skeleton';
import { layout, radii, spacing } from '@/theme';

import { posterSize } from './DetailHero';

export interface DetailSkeletonProps {
  topInset: number;
  contentWidth: number;
}

const TILES = 5;

/** Loading placeholder mirroring the hero, CTA and episode tiles. */
export function DetailSkeleton({ topInset, contentWidth }: DetailSkeletonProps) {
  const { width, height } = posterSize(contentWidth);
  const gap = spacing[2];
  const tile = Math.floor((contentWidth - layout.gutter * 2 - gap * (TILES - 1)) / TILES);

  return (
    <View accessibilityLabel="Memuat" accessibilityRole="progressbar" style={[styles.root, { paddingTop: topInset }]}>
      <Skeleton width={width} height={height} radius={radii.lg} />
      <Skeleton width={96} height={22} radius={radii.pill} style={styles.pill} />
      <Skeleton width="72%" height={28} radius={radii.sm} style={styles.title} />
      <Skeleton width="48%" height={28} radius={radii.sm} style={styles.titleSecond} />
      <Skeleton width="55%" height={14} radius={radii.xs} style={styles.meta} />
      <View style={styles.tags}>
        <Skeleton width={64} height={28} radius={radii.pill} />
        <Skeleton width={78} height={28} radius={radii.pill} />
        <Skeleton width={56} height={28} radius={radii.pill} />
      </View>
      <Skeleton height={52} radius={radii.pill} style={styles.cta} />
      <Skeleton width={150} height={18} radius={radii.xs} style={styles.section} />
      <View style={[styles.tiles, { gap }]}>
        {Array.from({ length: TILES }).map((_, i) => (
          <Skeleton key={i} width={tile} height={tile} radius={radii.md} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', paddingHorizontal: layout.gutter },
  pill: { marginTop: spacing[5] },
  title: { marginTop: spacing[4] },
  titleSecond: { marginTop: spacing[2] },
  meta: { marginTop: spacing[3] },
  tags: { flexDirection: 'row', gap: spacing[2], marginTop: spacing[4] },
  cta: { alignSelf: 'stretch', marginTop: spacing[6] },
  section: { alignSelf: 'flex-start', marginTop: spacing[8] },
  tiles: { flexDirection: 'row', alignSelf: 'stretch', marginTop: spacing[3] },
});
