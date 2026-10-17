import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import type { DramaDetail } from '@/api/types';
import { SectionHeader } from '@/components/drama/SectionHeader';
import { episodeCount } from '@/lib/format';
import { watchHref } from '@/lib/routes';
import type { HistoryEntry } from '@/store';
import { layout, spacing } from '@/theme';

import { EpisodeGrid } from './EpisodeGrid';

export interface EpisodesSectionProps {
  drama: DramaDetail;
  entry?: HistoryEntry;
  /** Width available for the tiles, excluding the gutters. */
  width: number;
}

export function EpisodesSection({ drama, entry, width }: EpisodesSectionProps) {
  const total = episodeCount(drama);
  const status = drama.isCompleted ? 'Tamat' : 'Berlanjut';
  const subtitle = total > 0 ? `${total} episode · ${status}` : status;

  return (
    <View>
      <SectionHeader title="Daftar Episode" subtitle={subtitle} style={styles.header} />
      <EpisodeGrid
        total={total}
        episodes={drama.episodes}
        currentEp={entry?.lastEpisode}
        watched={entry?.watched}
        played={entry?.positions}
        width={width}
        inset={layout.gutter}
        onSelect={(ep) => router.push(watchHref(drama.source, drama.id, ep))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { marginBottom: spacing[3] },
});
