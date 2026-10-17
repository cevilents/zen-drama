import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import type { DramaDetail } from '@/api/types';
import { EpisodeGrid } from '@/components/detail/EpisodeGrid';
import { PosterImage } from '@/components/drama/PosterImage';
import { AppText } from '@/components/ui/AppText';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useHistoryEntry } from '@/store/useHistory';
import { layout, radii, spacing } from '@/theme';

export interface EpisodeSheetProps {
  visible: boolean;
  onClose: () => void;
  drama: DramaDetail;
  total: number;
  currentEp: number;
  onSelect: (episode: number) => void;
}

/** Episode picker over the player: range tabs + tile grid, current episode highlighted. */
export function EpisodeSheet({ visible, onClose, drama, total, currentEp, onSelect }: EpisodeSheetProps) {
  const { width } = useWindowDimensions();
  const entry = useHistoryEntry(drama.source, drama.id);
  const gridWidth = Math.min(width, layout.maxContentWidth) - layout.gutter * 2;

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Daftar Episode" heightRatio={0.64}>
      <View style={styles.summary}>
        <PosterImage uri={drama.cover} style={styles.thumb} radius={radii.sm} />
        <View style={styles.summaryText}>
          <AppText variant="title" numberOfLines={1}>
            {drama.title}
          </AppText>
          <AppText variant="caption" color="textMuted">
            {total} episode{drama.isCompleted ? ' · Tamat' : ' · Berlanjut'} · Sedang EP {currentEp}
          </AppText>
        </View>
      </View>
      <ScrollView style={styles.flex} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <EpisodeGrid
          total={total}
          episodes={drama.episodes}
          currentEp={currentEp}
          watched={entry?.watched}
          played={entry?.positions}
          onSelect={onSelect}
          width={gridWidth}
          inset={0}
          tone="sheet"
        />
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  summary: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], marginBottom: spacing[4] },
  thumb: { width: 36 },
  summaryText: { flex: 1, gap: 2 },
  content: { paddingBottom: spacing[6] },
});
