import { SectionList, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { dramaKey, type HistoryEntry } from '@/store';
import { colors, layout, spacing } from '@/theme';

import type { HistorySection } from './groupHistory';
import { HistoryRow } from './HistoryRow';

export interface HistoryListProps {
  sections: HistorySection[];
  onOpen: (entry: HistoryEntry) => void;
  onRemove: (entry: HistoryEntry) => void;
  bottomPadding: number;
}

/** Watch history grouped by day with overline section headers. */
export function HistoryList({ sections, onOpen, onRemove, bottomPadding }: HistoryListProps) {
  return (
    <SectionList
      sections={sections}
      keyExtractor={(item) => dramaKey(item.drama.source, item.drama.id)}
      stickySectionHeadersEnabled
      showsVerticalScrollIndicator={false}
      ItemSeparatorComponent={Separator}
      contentContainerStyle={{ paddingBottom: bottomPadding }}
      renderSectionHeader={({ section }) => (
        <View style={styles.header}>
          <AppText variant="overline" color="textMuted" accessibilityRole="header">
            {section.title}
          </AppText>
          <AppText variant="overline" color="textMuted" style={styles.count}>
            {section.data.length}
          </AppText>
        </View>
      )}
      renderItem={({ item }) => <HistoryRow entry={item} onOpen={onOpen} onRemove={onRemove} />}
    />
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingHorizontal: layout.gutter,
    paddingTop: spacing[4],
    paddingBottom: spacing[3],
    backgroundColor: colors.bg,
  },
  count: { opacity: 0.6 },
  separator: { height: spacing[4] },
});
