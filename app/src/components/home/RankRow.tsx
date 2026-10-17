import { memo } from 'react';
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import type { Drama } from '@/api/types';
import { RankCard } from '@/components/drama/RankCard';
import { SectionHeader } from '@/components/drama/SectionHeader';
import { colors, layout, spacing } from '@/theme';

export interface RankRowProps {
  title?: string;
  items: Drama[];
  style?: StyleProp<ViewStyle>;
}

/** "Top 10 Hari Ini": outlined gold numerals peeking behind posters. */
export const RankRow = memo(function RankRow({ title = 'Top 10 Hari Ini', items, style }: RankRowProps) {
  const top = items.slice(0, 10);
  if (!top.length) return null;
  return (
    <View style={style}>
      <SectionHeader
        title={title}
        subtitle="Paling banyak ditonton hari ini"
        icon="trophy"
        iconColor={colors.gold}
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        contentContainerStyle={styles.content}>
        {top.map((d, i) => (
          <RankCard key={`${d.source}:${d.id}`} drama={d} rank={i + 1} posterWidth={108} />
        ))}
      </ScrollView>
    </View>
  );
});

const styles = StyleSheet.create({
  content: { paddingHorizontal: layout.gutter, paddingTop: spacing[3], gap: spacing[1] },
});
