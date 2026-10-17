import { StyleSheet, View } from 'react-native';

import { LoadingHero, LoadingRow } from '@/components/states/Loading';
import { Skeleton } from '@/components/ui/Skeleton';
import { layout, radii, spacing } from '@/theme';

/** First-load placeholder mirroring the home layout: hero, Top 10, two rows. */
export function HomeSkeleton({ heroHeight }: { heroHeight: number }) {
  return (
    <View accessibilityLabel="Memuat beranda" accessibilityRole="progressbar">
      <LoadingHero height={heroHeight} />
      <View style={styles.section}>
        <Skeleton height={18} width={150} radius={radii.xs} style={styles.header} />
        <View style={styles.rankRow}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={styles.rankItem}>
              <Skeleton width={46} height={110} radius={radii.sm} style={styles.rankNum} />
              <Skeleton width={108} aspectRatio={3 / 4} radius={radii.md} />
            </View>
          ))}
        </View>
      </View>
      <LoadingRow style={styles.section} itemWidth={116} />
      <LoadingRow style={styles.section} itemWidth={116} />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: spacing[8] },
  header: { marginHorizontal: layout.gutter, marginBottom: spacing[3] },
  rankRow: { flexDirection: 'row', gap: spacing[3], paddingHorizontal: layout.gutter, overflow: 'hidden' },
  rankItem: { flexDirection: 'row', alignItems: 'flex-end' },
  rankNum: { marginRight: -10, opacity: 0.6 },
});
