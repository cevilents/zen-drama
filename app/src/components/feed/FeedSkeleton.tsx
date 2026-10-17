import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

import { Shimmer, Skeleton } from '@/components/ui/Skeleton';
import { colors, gradients, layout, radii, spacing } from '@/theme';

export interface FeedSkeletonProps {
  height: number;
  /** Space reserved for the floating tab bar. */
  bottomSpace: number;
}

/** Full-screen shimmer that mirrors a feed page: stage, info block, action rail and CTA. */
export function FeedSkeleton({ height, bottomSpace }: FeedSkeletonProps) {
  return (
    <View style={[styles.root, { height }]} accessibilityRole="progressbar" accessibilityLabel="Memuat cuplikan">
      <Shimmer />
      <LinearGradient colors={gradients.videoBottom} locations={[0.4, 0.65, 1]} style={StyleSheet.absoluteFill} />
      <View style={[styles.bottom, { bottom: bottomSpace + spacing[3] }]}>
        <View style={styles.row}>
          <View style={styles.info}>
            <Skeleton height={20} width={110} radius={radii.xs} shimmer={false} />
            <Skeleton height={24} width="85%" radius={radii.sm} />
            <Skeleton height={24} width="55%" radius={radii.sm} />
            <View style={styles.tags}>
              <Skeleton height={22} width={64} radius={radii.xs} shimmer={false} />
              <Skeleton height={22} width={52} radius={radii.xs} shimmer={false} />
              <Skeleton height={22} width={72} radius={radii.xs} shimmer={false} />
            </View>
            <Skeleton height={12} width="95%" radius={radii.xs} />
            <Skeleton height={12} width="70%" radius={radii.xs} />
          </View>
          <View style={styles.rail}>
            {[0, 1, 2, 3].map((i) => (
              <View key={i} style={styles.railItem}>
                <Skeleton width={34} height={34} radius={radii.pill} shimmer={false} />
                <Skeleton width={32} height={8} radius={radii.xs} shimmer={false} />
              </View>
            ))}
          </View>
        </View>
        <Skeleton height={52} radius={radii.pill} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { width: '100%', backgroundColor: colors.surface, overflow: 'hidden' },
  bottom: { position: 'absolute', left: layout.gutter, right: layout.gutter - spacing[1], gap: spacing[4] },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing[3] },
  info: { flex: 1, gap: spacing[2] },
  tags: { flexDirection: 'row', gap: spacing[1.5], marginVertical: spacing[0.5] },
  rail: { width: 56, alignItems: 'center', gap: spacing[4] },
  railItem: { alignItems: 'center', gap: spacing[1.5] },
});
