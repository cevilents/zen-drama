import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { Drama } from '@/api/types';
import { AppText } from '@/components/ui/AppText';
import { Badge } from '@/components/ui/Badge';
import { formatViews } from '@/lib/format';
import { colors, radii, spacing } from '@/theme';

import { onVideo, videoTextShadow } from './overlay';

export interface FeedInfoProps {
  drama: Drama;
  /** "#3 Trending" style rank badge (Trending tab). */
  rankLabel?: string;
  onOpenDetail: () => void;
}

/** Title, tags, expandable synopsis and the "EP 1 / 80" pill shown over the preview. */
export function FeedInfo({ drama, rankLabel, onOpenDetail }: FeedInfoProps) {
  const [expanded, setExpanded] = useState(false);
  const tags = drama.tags.filter(Boolean).slice(0, 3);
  const total = drama.totalEpisodes;

  return (
    <View style={styles.root}>
      {(rankLabel || drama.isCompleted) && (
        <View style={styles.badges}>
          {rankLabel && <Badge variant="rank" icon="flame" label={rankLabel} size="md" />}
          {drama.isCompleted && <Badge variant="completed" size="md" />}
        </View>
      )}

      <Pressable onPress={onOpenDetail} accessibilityRole="link" accessibilityLabel={`Buka detail ${drama.title}`}>
        <AppText variant="h2" color={onVideo.text} numberOfLines={2} style={videoTextShadow}>
          {drama.title}
        </AppText>
      </Pressable>

      {tags.length > 0 && (
        <View style={styles.tags}>
          {tags.map((t) => (
            <View key={t} style={styles.tag}>
              <AppText variant="caption" weight="semibold" color={onVideo.text} numberOfLines={1}>
                {t}
              </AppText>
            </View>
          ))}
        </View>
      )}

      {!!drama.description && (
        <Pressable
          onPress={() => setExpanded((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={expanded ? 'Ringkas sinopsis' : 'Baca sinopsis lengkap'}
          accessibilityState={{ expanded }}>
          <AppText
            variant="bodySm"
            color={onVideo.textDim}
            numberOfLines={expanded ? 6 : 2}
            style={[styles.synopsis, videoTextShadow]}>
            {drama.description}
          </AppText>
        </Pressable>
      )}

      <View style={styles.meta}>
        <View style={styles.epPill}>
          <Ionicons name="play" size={11} color={colors.primary} />
          <AppText variant="caption" weight="bold" color={onVideo.text} tabular>
            EP 1{total > 0 ? ` / ${total}` : ''}
          </AppText>
        </View>
        {drama.viewCount > 0 && (
          <AppText variant="caption" color={onVideo.textDim} style={videoTextShadow}>
            {formatViews(drama.viewCount)} ditonton
          </AppText>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing[2] },
  badges: { flexDirection: 'row', gap: spacing[1.5] },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[1.5] },
  tag: {
    paddingHorizontal: spacing[2],
    height: 22,
    justifyContent: 'center',
    borderRadius: radii.xs,
    backgroundColor: onVideo.chip,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: onVideo.chipBorder,
    maxWidth: 140,
  },
  synopsis: { lineHeight: 19 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing[2.5] },
  epPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    height: 24,
    paddingHorizontal: spacing[2.5],
    borderRadius: radii.pill,
    backgroundColor: colors.glassStrong,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassBorder,
  },
});
