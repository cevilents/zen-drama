import { useMemo } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { flattenPages, useList } from '@/api/hooks';
import type { ContentLanguage } from '@/api/types';
import { DramaCard } from '@/components/drama/DramaCard';
import { SectionHeader } from '@/components/drama/SectionHeader';
import { LoadingRow } from '@/components/states/Loading';
import { layout, spacing } from '@/theme';

const CARD_WIDTH = 116;
const MAX_ITEMS = 12;

export interface RecommendRowProps {
  source: string;
  /** The drama being viewed, excluded from the suggestions. */
  excludeId: string;
  /** Catalog language of the drama being viewed; suggestions come from the same catalog. */
  lang?: ContentLanguage;
}

/** "Mungkin Kamu Suka": horizontal row of the source's "foryou" list. Hidden when empty. */
export function RecommendRow({ source, excludeId, lang = 'id' }: RecommendRowProps) {
  const query = useList(source, 'foryou', lang);
  const items = useMemo(
    () =>
      flattenPages(query.data)
        .filter((d) => d.id !== excludeId)
        .slice(0, MAX_ITEMS),
    [query.data, excludeId],
  );

  if (items.length === 0) {
    return query.isPending ? <LoadingRow itemWidth={CARD_WIDTH} /> : null;
  }

  return (
    <>
      <SectionHeader title="Mungkin Kamu Suka" style={styles.header} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.content}>
        {items.map((drama) => (
          <DramaCard key={`${drama.source}:${drama.id}`} drama={drama} width={CARD_WIDTH} />
        ))}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  header: { marginBottom: spacing[3] },
  content: { gap: spacing[3], paddingHorizontal: layout.gutter },
});
