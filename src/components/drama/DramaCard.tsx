import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import type { Drama } from '@/api/types';
import { AppText } from '@/components/ui/AppText';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import { PressableScale } from '@/components/ui/PressableScale';
import { formatViews } from '@/lib/format';
import { dramaHref } from '@/lib/routes';
import { useSettings } from '@/store/useSettings';
import { gradients, radii, spacing } from '@/theme';

import { PosterImage } from './PosterImage';
import { ProgressBar } from './ProgressBar';

export interface DramaCardProps {
  drama: Drama;
  /** Fixed card width (rows). Omit to fill the parent (grids). */
  width?: number;
  /** Default: navigate to detail. */
  onPress?: (drama: Drama) => void;
  onLongPress?: (drama: Drama) => void;
  /** Small gold rank badge in the top-left ("#3"). */
  rank?: number;
  /** 0..1 watch progress bar on the poster bottom. */
  progress?: number;
  /** Top-left badge. "auto" = TAMAT when completed. Default "auto". Pass null to hide. */
  badge?: BadgeVariant | 'auto' | null;
  /** Lines of title under the poster. 0 hides the title. Default 2. */
  titleLines?: 0 | 1 | 2;
  /** Show "1,3 jt ditonton" / first tag under the title. Default false. */
  showMeta?: boolean;
  priority?: 'low' | 'normal' | 'high';
  style?: StyleProp<ViewStyle>;
}

/** Vertical 3:4 poster card used in rows and grids. */
export function DramaCard({
  drama,
  width,
  onPress,
  onLongPress,
  rank,
  progress,
  badge = 'auto',
  titleLines = 2,
  showMeta = false,
  priority,
  style,
}: DramaCardProps) {
  const resolvedBadge: BadgeVariant | null =
    badge === 'auto' ? (drama.isCompleted ? 'completed' : null) : badge;
  // English-catalog items (e.g. from Daftarku) stand out while browsing in Indonesian.
  const showEn = useSettings((s) => s.contentLang === 'id') && drama.lang === 'en';
  const meta = drama.viewCount > 0 ? `${formatViews(drama.viewCount)} ditonton` : drama.tags[0];

  return (
    <PressableScale
      onPress={() => (onPress ? onPress(drama) : router.push(dramaHref(drama)))}
      onLongPress={onLongPress ? () => onLongPress(drama) : undefined}
      accessibilityLabel={`${drama.title}, ${drama.totalEpisodes} episode`}
      accessibilityHint="Buka detail drama"
      style={[width ? { width } : styles.fill, style]}>
      <PosterImage uri={drama.cover} accessibilityLabel={drama.title} priority={priority} radius={radii.md}>
        <LinearGradient colors={gradients.posterBottom} locations={[0.5, 0.72, 1]} style={StyleSheet.absoluteFill} />
        <View style={styles.topRow}>
          {rank ? <Badge variant="rank" label={`#${rank}`} /> : resolvedBadge ? <Badge variant={resolvedBadge} /> : null}
          {showEn && <Badge variant="episodes" label="EN" style={styles.lang} />}
        </View>
        {drama.totalEpisodes > 0 && (
          <View style={[styles.bottomRow, progress != null && styles.bottomRowWithProgress]}>
            <Badge variant="episodes" label={`EP ${drama.totalEpisodes}`} />
          </View>
        )}
        {progress != null && (
          <View style={styles.progress}>
            <ProgressBar progress={progress} />
          </View>
        )}
      </PosterImage>
      {titleLines > 0 && (
        <AppText variant="title" numberOfLines={titleLines} style={styles.title}>
          {drama.title}
        </AppText>
      )}
      {showMeta && !!meta && (
        <AppText variant="caption" color="textMuted" numberOfLines={1} style={styles.meta}>
          {meta}
        </AppText>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  topRow: { position: 'absolute', top: spacing[2], left: spacing[2], right: spacing[2], flexDirection: 'row' },
  bottomRow: { position: 'absolute', left: spacing[2], bottom: spacing[2] },
  bottomRowWithProgress: { bottom: spacing[3] + 3 },
  progress: { position: 'absolute', left: spacing[2], right: spacing[2], bottom: spacing[2] },
  lang: { marginLeft: 'auto' },
  title: { marginTop: spacing[2], fontSize: 14, lineHeight: 18 },
  meta: { marginTop: 2 },
});
