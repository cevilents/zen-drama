import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Skeleton } from '@/components/ui/Skeleton';
import { layout, radii, spacing } from '@/theme';

export interface LoadingGridProps {
  /** Default 3. */
  columns?: number;
  /** Default 3. */
  rows?: number;
  /** Show 2 title lines under each poster. Default true. */
  withTitle?: boolean;
  gap?: number;
  style?: StyleProp<ViewStyle>;
}

/** Poster-grid skeleton (search results, "Lihat semua", library). */
export function LoadingGrid({ columns = 3, rows = 3, withTitle = true, gap = spacing[3], style }: LoadingGridProps) {
  return (
    <View
      accessibilityLabel="Memuat"
      accessibilityRole="progressbar"
      style={[styles.grid, { gap, paddingHorizontal: layout.gutter }, style]}>
      {Array.from({ length: rows }).map((_, r) => (
        <View key={r} style={[styles.row, { gap }]}>
          {Array.from({ length: columns }).map((__, c) => (
            <View key={c} style={styles.cell}>
              <Skeleton aspectRatio={3 / 4} radius={radii.md} />
              {withTitle && (
                <>
                  <Skeleton height={12} width="90%" radius={radii.xs} style={styles.line1} />
                  <Skeleton height={12} width="55%" radius={radii.xs} style={styles.line2} />
                </>
              )}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

export interface LoadingRowProps {
  /** Default 4. */
  count?: number;
  /** Default 120. */
  itemWidth?: number;
  /** Section title placeholder. Default true. */
  withHeader?: boolean;
  withTitle?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** Horizontal row skeleton with section header placeholder (home rows). */
export function LoadingRow({ count = 4, itemWidth = 120, withHeader = true, withTitle = true, style }: LoadingRowProps) {
  return (
    <View accessibilityLabel="Memuat" accessibilityRole="progressbar" style={style}>
      {withHeader && (
        <Skeleton height={18} width={160} radius={radii.xs} style={styles.header} />
      )}
      <ScrollView
        horizontal
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rowContent}>
        {Array.from({ length: count }).map((_, i) => (
          <View key={i} style={{ width: itemWidth }}>
            <Skeleton aspectRatio={3 / 4} radius={radii.md} />
            {withTitle && <Skeleton height={12} width="80%" radius={radii.xs} style={styles.line1} />}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

export interface LoadingListProps {
  /** Default 5. */
  count?: number;
  posterWidth?: number;
  style?: StyleProp<ViewStyle>;
}

/** Skeleton for DramaCardWide lists (search results, library). */
export function LoadingList({ count = 5, posterWidth = 92, style }: LoadingListProps) {
  return (
    <View accessibilityLabel="Memuat" accessibilityRole="progressbar" style={[styles.list, style]}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={styles.listRow}>
          <Skeleton width={posterWidth} aspectRatio={3 / 4} radius={radii.md} />
          <View style={styles.listBody}>
            <Skeleton height={16} width="85%" radius={radii.xs} />
            <Skeleton height={12} width="45%" radius={radii.xs} />
            <Skeleton height={12} width="95%" radius={radii.xs} style={styles.line1} />
            <Skeleton height={12} width="70%" radius={radii.xs} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** Full-bleed hero banner skeleton (home top). */
export function LoadingHero({ height = 460 }: { height?: number }) {
  return (
    <View accessibilityLabel="Memuat" accessibilityRole="progressbar">
      <Skeleton height={height} radius={0} />
      <View style={styles.heroMeta}>
        <Skeleton height={28} width="70%" radius={radii.sm} />
        <Skeleton height={14} width="45%" radius={radii.xs} />
        <Skeleton height={48} width={180} radius={radii.pill} style={styles.line1} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {},
  row: { flexDirection: 'row' },
  cell: { flex: 1 },
  line1: { marginTop: spacing[2] },
  line2: { marginTop: spacing[1] },
  header: { marginHorizontal: layout.gutter, marginBottom: spacing[3] },
  rowContent: { gap: spacing[3], paddingHorizontal: layout.gutter },
  list: { paddingHorizontal: layout.gutter, gap: spacing[4] },
  listRow: { flexDirection: 'row', gap: spacing[3] },
  listBody: { flex: 1, gap: spacing[2], paddingTop: spacing[1] },
  heroMeta: { position: 'absolute', left: layout.gutter, right: layout.gutter, bottom: spacing[6], gap: spacing[2] },
});
