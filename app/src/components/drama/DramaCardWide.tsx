import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import type { Drama } from '@/api/types';
import { AppText } from '@/components/ui/AppText';
import { Badge } from '@/components/ui/Badge';
import { PressableScale } from '@/components/ui/PressableScale';
import { formatViews } from '@/lib/format';
import { dramaHref } from '@/lib/routes';
import { colors, radii, spacing } from '@/theme';

import { PosterImage } from './PosterImage';
import { ProgressBar } from './ProgressBar';

export interface DramaCardWideProps {
  drama: Drama;
  /** Default: navigate to detail. */
  onPress?: (drama: Drama) => void;
  onLongPress?: (drama: Drama) => void;
  /** Poster width. Default 92 (height = width * 4/3). */
  posterWidth?: number;
  /** Optional line under the title, replaces tags (e.g. "Lanjut EP 5 · 12:30"). */
  subtitle?: string;
  /** 0..1 progress bar on the poster. */
  progress?: number;
  /** Right-side accessory (e.g. remove IconButton). */
  right?: ReactNode;
  /** Highlight a substring of the title (search results). Case-insensitive. */
  highlight?: string;
  style?: StyleProp<ViewStyle>;
}

function HighlightedTitle({ title, highlight }: { title: string; highlight?: string }) {
  const q = highlight?.trim();
  const idx = q ? title.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (!q || idx < 0) {
    return (
      <AppText variant="title" numberOfLines={2}>
        {title}
      </AppText>
    );
  }
  return (
    <AppText variant="title" numberOfLines={2}>
      {title.slice(0, idx)}
      <AppText variant="title" color="primary">
        {title.slice(idx, idx + q.length)}
      </AppText>
      {title.slice(idx + q.length)}
    </AppText>
  );
}

/** Horizontal list row: poster + title, tags, 2-line synopsis, episode/views meta. */
export function DramaCardWide({
  drama,
  onPress,
  onLongPress,
  posterWidth = 92,
  subtitle,
  progress,
  right,
  highlight,
  style,
}: DramaCardWideProps) {
  const tags = drama.tags.slice(0, 3).join(' · ');

  return (
    <PressableScale
      activeScale={0.98}
      onPress={() => (onPress ? onPress(drama) : router.push(dramaHref(drama)))}
      onLongPress={onLongPress ? () => onLongPress(drama) : undefined}
      accessibilityLabel={`${drama.title}, ${drama.totalEpisodes} episode`}
      style={[styles.row, style]}>
      <PosterImage uri={drama.cover} style={{ width: posterWidth }} radius={radii.md} accessibilityLabel={drama.title}>
        {drama.isCompleted && <Badge variant="completed" style={styles.badge} />}
        {progress != null && (
          <View style={styles.progress}>
            <ProgressBar progress={progress} />
          </View>
        )}
      </PosterImage>

      <View style={styles.body}>
        <HighlightedTitle title={drama.title} highlight={highlight} />
        {subtitle ? (
          <AppText variant="caption" color="primary" numberOfLines={1} style={styles.sub}>
            {subtitle}
          </AppText>
        ) : tags ? (
          <AppText variant="caption" color="textSecondary" numberOfLines={1} style={styles.sub}>
            {tags}
          </AppText>
        ) : null}
        {!!drama.description && (
          <AppText variant="bodySm" color="textMuted" numberOfLines={2} style={styles.synopsis}>
            {drama.description}
          </AppText>
        )}
        <View style={styles.meta}>
          {drama.totalEpisodes > 0 && (
            <View style={styles.metaItem}>
              <Ionicons name="albums-outline" size={12} color={colors.textMuted} />
              <AppText variant="caption" color="textMuted">
                {drama.totalEpisodes} EP
              </AppText>
            </View>
          )}
          {drama.viewCount > 0 && (
            <View style={styles.metaItem}>
              <Ionicons name="play-outline" size={12} color={colors.textMuted} />
              <AppText variant="caption" color="textMuted">
                {formatViews(drama.viewCount)}
              </AppText>
            </View>
          )}
        </View>
      </View>

      {right && <View style={styles.right}>{right}</View>}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing[3], alignItems: 'flex-start' },
  badge: { position: 'absolute', top: spacing[1.5], left: spacing[1.5] },
  progress: { position: 'absolute', left: spacing[1.5], right: spacing[1.5], bottom: spacing[1.5] },
  body: { flex: 1, paddingTop: spacing[0.5], minHeight: 44 },
  sub: { marginTop: spacing[1] },
  synopsis: { marginTop: spacing[1.5] },
  meta: { flexDirection: 'row', gap: spacing[3], marginTop: spacing[2] },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: spacing[1] },
  right: { alignSelf: 'center' },
});
