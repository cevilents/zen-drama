import { FlatList, StyleSheet, View, useWindowDimensions } from 'react-native';

import type { Drama } from '@/api/types';
import { AppText } from '@/components/ui/AppText';
import { dramaKey, type FavoriteEntry } from '@/store';
import { layout, spacing } from '@/theme';

import { FavoriteGridItem } from './FavoriteGridItem';

const COLUMNS = 3;
const GAP = spacing[3];

export interface FavoritesGridProps {
  entries: FavoriteEntry[];
  editing: boolean;
  /** Selected `source:id` keys. */
  selected: ReadonlySet<string>;
  onToggle: (drama: Drama) => void;
  onEnterEdit: (drama: Drama) => void;
  bottomPadding: number;
}

/** 3-column poster grid of favorites. Column width derives from the max-width-constrained content box. */
export function FavoritesGrid({ entries, editing, selected, onToggle, onEnterEdit, bottomPadding }: FavoritesGridProps) {
  const { width: screenWidth } = useWindowDimensions();
  const contentWidth = Math.min(screenWidth, layout.maxContentWidth);
  const columnWidth = Math.floor((contentWidth - layout.gutter * 2 - GAP * (COLUMNS - 1)) / COLUMNS);

  return (
    <FlatList
      data={entries}
      numColumns={COLUMNS}
      keyExtractor={(item) => dramaKey(item.drama.source, item.drama.id)}
      extraData={selected}
      columnWrapperStyle={styles.columns}
      ItemSeparatorComponent={Separator}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={
        editing ? (
          <AppText variant="bodySm" color="textMuted" style={styles.hint}>
            Ketuk drama untuk memilih
          </AppText>
        ) : null
      }
      contentContainerStyle={[styles.content, { paddingBottom: bottomPadding }]}
      renderItem={({ item }) => (
        <FavoriteGridItem
          drama={item.drama}
          width={columnWidth}
          editing={editing}
          selected={selected.has(dramaKey(item.drama.source, item.drama.id))}
          onToggle={onToggle}
          onEnterEdit={onEnterEdit}
        />
      )}
    />
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing[4] },
  columns: { gap: GAP, paddingHorizontal: layout.gutter },
  separator: { height: spacing[5] },
  hint: { paddingHorizontal: layout.gutter, paddingBottom: spacing[3], marginTop: -spacing[1] },
});
