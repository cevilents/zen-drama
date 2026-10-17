import { memo, useCallback } from 'react';
import { FlatList, Platform, StyleSheet, View, type ListRenderItem, type StyleProp, type ViewStyle } from 'react-native';

import { ContinueCard } from '@/components/drama/ContinueCard';
import { SectionHeader } from '@/components/drama/SectionHeader';
import { toast } from '@/store';
import { useContinueWatching, useHistory, type HistoryEntry } from '@/store/useHistory';
import { layout, spacing } from '@/theme';

const CARD_W = 128;
const GAP = spacing[3];

const keyOf = (e: HistoryEntry) => `${e.drama.source}:${e.drama.id}`;
const Separator = () => <View style={styles.sep} />;

function removeEntry(entry: HistoryEntry) {
  useHistory.getState().remove(entry.drama.source, entry.drama.id);
  toast.show('Dihapus dari riwayat', { icon: 'trash-outline' });
}

/** "Lanjutkan Menonton": only rendered when there is history. */
export const ContinueRow = memo(function ContinueRow({ style }: { style?: StyleProp<ViewStyle> }) {
  const entries = useContinueWatching(12);

  const renderItem = useCallback<ListRenderItem<HistoryEntry>>(
    ({ item }) => <ContinueCard entry={item} width={CARD_W} onRemove={removeEntry} />,
    [],
  );
  const getItemLayout = useCallback(
    (_: ArrayLike<HistoryEntry> | null | undefined, index: number) => ({
      length: CARD_W + GAP,
      offset: layout.gutter + (CARD_W + GAP) * index,
      index,
    }),
    [],
  );

  if (!entries.length) return null;

  return (
    <View style={style}>
      <SectionHeader title="Lanjutkan Menonton" icon="play-circle" subtitle="Pas di bagian serunya" />
      <FlatList
        horizontal
        data={entries}
        keyExtractor={keyOf}
        renderItem={renderItem}
        getItemLayout={getItemLayout}
        ItemSeparatorComponent={Separator}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.content}
        removeClippedSubviews={Platform.OS !== 'web'}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  content: { paddingHorizontal: layout.gutter, paddingTop: spacing[3] },
  sep: { width: GAP },
});
