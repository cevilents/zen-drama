import { memo, useCallback } from 'react';
import { FlatList, Platform, StyleSheet, View, type ListRenderItem, type StyleProp, type ViewStyle } from 'react-native';

import type { Drama } from '@/api/types';
import { DramaCard } from '@/components/drama/DramaCard';
import { SectionHeader } from '@/components/drama/SectionHeader';
import type { BadgeVariant } from '@/components/ui/Badge';
import type { IoniconName } from '@/components/ui/IconButton';
import { layout, spacing } from '@/theme';

const GAP = spacing[3];

export interface DramaRowProps {
  title: string;
  subtitle?: string;
  icon?: IoniconName;
  iconColor?: string;
  items: Drama[];
  /** Poster width. Default 116. */
  cardWidth?: number;
  badge?: BadgeVariant | 'auto' | null;
  showMeta?: boolean;
  onSeeAll?: () => void;
  onLongPress?: (drama: Drama) => void;
  style?: StyleProp<ViewStyle>;
}

const keyOf = (d: Drama) => `${d.source}:${d.id}`;
const Separator = () => <View style={styles.sep} />;

/** Section header + horizontally scrolling poster row. */
export const DramaRow = memo(function DramaRow({
  title,
  subtitle,
  icon,
  iconColor,
  items,
  cardWidth = 116,
  badge = 'auto',
  showMeta = false,
  onSeeAll,
  onLongPress,
  style,
}: DramaRowProps) {
  const renderItem = useCallback<ListRenderItem<Drama>>(
    ({ item }) => (
      <DramaCard drama={item} width={cardWidth} badge={badge} showMeta={showMeta} onLongPress={onLongPress} />
    ),
    [cardWidth, badge, showMeta, onLongPress],
  );

  const getItemLayout = useCallback(
    (_: ArrayLike<Drama> | null | undefined, index: number) => ({
      length: cardWidth + GAP,
      offset: layout.gutter + (cardWidth + GAP) * index,
      index,
    }),
    [cardWidth],
  );

  if (!items.length) return null;

  return (
    <View style={style}>
      <SectionHeader title={title} subtitle={subtitle} icon={icon} iconColor={iconColor} onSeeAll={onSeeAll} />
      <FlatList
        horizontal
        data={items}
        keyExtractor={keyOf}
        renderItem={renderItem}
        getItemLayout={getItemLayout}
        ItemSeparatorComponent={Separator}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.content}
        initialNumToRender={4}
        maxToRenderPerBatch={4}
        windowSize={5}
        removeClippedSubviews={Platform.OS !== 'web'}
        decelerationRate="fast"
        snapToInterval={cardWidth + GAP}
        snapToAlignment="start"
      />
    </View>
  );
});

const styles = StyleSheet.create({
  content: { paddingHorizontal: layout.gutter, paddingTop: spacing[3] },
  sep: { width: GAP },
});
