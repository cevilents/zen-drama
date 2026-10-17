import { memo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import type { Drama } from '@/api/types';
import { DramaCard } from '@/components/drama/DramaCard';
import type { BadgeVariant } from '@/components/ui/Badge';
import { layout, spacing } from '@/theme';

export const GRID_GAP = spacing[2.5];

export interface PosterGridRowProps {
  items: Drama[];
  columns?: number;
  onLongPress?: (drama: Drama) => void;
  showMeta?: boolean;
  /** Poster badge. Default none: "TAMAT" on every card is noise in a dense grid. */
  badge?: BadgeVariant | 'auto' | null;
  style?: StyleProp<ViewStyle>;
}

/** One row of an N-column poster grid. Short last rows keep cell widths via spacers. */
export const PosterGridRow = memo(function PosterGridRow({
  items,
  columns = 3,
  onLongPress,
  showMeta,
  badge = null,
  style,
}: PosterGridRowProps) {
  const fillers = Math.max(0, columns - items.length);
  return (
    <View style={[styles.row, style]}>
      {items.map((d) => (
        <View key={`${d.source}:${d.id}`} style={styles.cell}>
          <DramaCard drama={d} onLongPress={onLongPress} showMeta={showMeta} badge={badge} />
        </View>
      ))}
      {Array.from({ length: fillers }).map((_, i) => (
        <View key={`f${i}`} style={styles.cell} />
      ))}
    </View>
  );
});

/** Chunk a list into grid rows. */
export function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: GRID_GAP, paddingHorizontal: layout.gutter },
  cell: { flex: 1 },
});
