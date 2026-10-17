import { StyleSheet, View } from 'react-native';

import type { Drama } from '@/api/types';
import { PosterImage } from '@/components/drama/PosterImage';
import { AppText } from '@/components/ui/AppText';
import { Badge } from '@/components/ui/Badge';
import { Chip } from '@/components/ui/Chip';
import { FadeIn } from '@/components/ui/FadeIn';
import { GlassView } from '@/components/ui/GlassView';
import { formatViews } from '@/lib/format';
import { colors, layout, radii, shadows, spacing } from '@/theme';

import { useSourceName } from './useSourceName';

const POSTER_MAX_WIDTH = 190;
const MAX_TAGS = 5;

/** Poster box for a given content width: ~44% of it, capped, always 3:4. */
export function posterSize(contentWidth: number): { width: number; height: number } {
  const width = Math.min(POSTER_MAX_WIDTH, Math.round(contentWidth * 0.44));
  return { width, height: Math.round(width / layout.posterAspect) };
}

function buildMeta(drama: Drama): string {
  const parts: string[] = [];
  if (drama.totalEpisodes > 0) parts.push(`${drama.totalEpisodes} Episode`);
  if (drama.isCompleted) parts.push('Tamat');
  if (drama.viewCount > 0) parts.push(`${formatViews(drama.viewCount)} ditonton`);
  return parts.join(' · ');
}

export interface DetailHeroProps {
  drama: Drama;
  /** Space reserved above the poster for the sticky header. */
  topInset: number;
  contentWidth: number;
}

/** Centered poster, source/status badges, title, meta line and genre tags. */
export function DetailHero({ drama, topInset, contentWidth }: DetailHeroProps) {
  const sourceName = useSourceName(drama.source);
  const { width } = posterSize(contentWidth);
  const meta = buildMeta(drama);
  const tags = drama.tags.filter(Boolean).slice(0, MAX_TAGS);

  return (
    <View style={[styles.root, { paddingTop: topInset }]}>
      <FadeIn>
        <View style={[styles.poster, { width }]}>
          <PosterImage uri={drama.cover} radius={radii.lg} priority="high" accessibilityLabel={drama.title}>
            <View pointerEvents="none" style={styles.posterBorder} />
          </PosterImage>
        </View>
      </FadeIn>

      <FadeIn delay={80} style={styles.info}>
        <View style={styles.badges}>
          <GlassView intensity={30} style={styles.sourcePill}>
            <View style={styles.dot} />
            <AppText variant="caption" weight="bold" color="textSecondary">
              {sourceName}
            </AppText>
          </GlassView>
          {drama.isCompleted && <Badge variant="completed" size="md" />}
        </View>

        <AppText variant="h1" align="center" numberOfLines={3} accessibilityRole="header" style={styles.title}>
          {drama.title}
        </AppText>

        {!!meta && (
          <AppText variant="bodySm" color="textSecondary" align="center" style={styles.meta}>
            {meta}
          </AppText>
        )}

        {tags.length > 0 && (
          <View style={styles.tags}>
            {tags.map((tag) => (
              <Chip key={tag} label={tag} size="sm" static />
            ))}
          </View>
        )}
      </FadeIn>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', paddingHorizontal: layout.gutter },
  poster: {
    aspectRatio: layout.posterAspect,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceAlt,
    ...shadows.lg,
  },
  posterBorder: {
    ...StyleSheet.absoluteFill,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassBorder,
  },
  info: { alignItems: 'center', alignSelf: 'stretch', marginTop: spacing[5] },
  badges: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], marginBottom: spacing[3] },
  sourcePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1.5],
    height: 22,
    paddingHorizontal: spacing[2.5],
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassBorder,
  },
  dot: { width: 5, height: 5, borderRadius: radii.pill, backgroundColor: colors.primary },
  title: { maxWidth: 420 },
  meta: { marginTop: spacing[2] },
  tags: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing[2], marginTop: spacing[4] },
});
