import { router } from 'expo-router';
import { useId } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient as SvgGradient, Stop, Text as SvgText } from 'react-native-svg';

import type { Drama } from '@/api/types';
import { AppText } from '@/components/ui/AppText';
import { Badge } from '@/components/ui/Badge';
import { PressableScale } from '@/components/ui/PressableScale';
import { dramaHref } from '@/lib/routes';
import { colors, fonts, radii, spacing } from '@/theme';

import { PosterImage } from './PosterImage';

export interface RankCardProps {
  drama: Drama;
  /** 1-based rank. */
  rank: number;
  /** Poster width. Default 112. Total card width = posterWidth + numeral overlap. */
  posterWidth?: number;
  onPress?: (drama: Drama) => void;
  /** Show title below. Default true. */
  showTitle?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** Horizontal advance of the numeral at a given font size (Plus Jakarta ExtraBold digits ≈ 0.6em). */
function numeralWidth(rank: number, fontSize: number): number {
  const len = String(rank).length;
  return fontSize * 0.6 * len - (len - 1) * fontSize * 0.12 + 6;
}

/** Box height that fits the digit cap height (~0.72em) plus stroke. */
const numeralBoxHeight = (fontSize: number) => fontSize * 0.78;

/** Outlined, gold-gradient stroked numeral. */
function RankNumeral({ rank, fontSize }: { rank: number; fontSize: number }) {
  const width = numeralWidth(rank, fontSize);
  const height = numeralBoxHeight(fontSize);
  // Unique per instance: duplicate ids across rows (same rank in two lists) collide on web.
  // useId() yields ":r1:"-style ids; colons break `url(#…)` references, so strip them.
  const gradId = `rankGold${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;

  return (
    <Svg width={width} height={height}>
      <Defs>
        <SvgGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFE2A3" />
          <Stop offset="0.55" stopColor="#F5B841" />
          <Stop offset="1" stopColor="#B87412" />
        </SvgGradient>
      </Defs>
      <SvgText
        x={width - 3}
        y={height - 2}
        textAnchor="end"
        fontFamily={fonts.extrabold}
        fontWeight="800"
        fontSize={fontSize}
        letterSpacing={-fontSize * 0.12}
        fill={colors.bg}
        stroke={`url(#${gradId})`}
        strokeWidth={3}
        strokeLinejoin="round">
        {String(rank)}
      </SvgText>
    </Svg>
  );
}

/** How far the poster slides over the numeral's right edge. */
const POSTER_OVERLAP = 18;

/** Netflix Top-10 style: big outlined gold numeral peeking from behind the poster. */
export function RankCard({
  drama,
  rank,
  posterWidth = 112,
  onPress,
  showTitle = true,
  style,
}: RankCardProps) {
  const posterHeight = (posterWidth * 4) / 3;
  const fontSize = posterHeight * 0.92;
  const offset = numeralWidth(rank, fontSize) - POSTER_OVERLAP;

  return (
    <PressableScale
      onPress={() => (onPress ? onPress(drama) : router.push(dramaHref(drama)))}
      accessibilityLabel={`Peringkat ${rank}, ${drama.title}`}
      accessibilityHint="Buka detail drama"
      style={[{ width: offset + posterWidth }, style]}>
      <View style={[styles.stage, { height: posterHeight }]}>
        <View style={styles.numeral} aria-hidden pointerEvents="none">
          <RankNumeral rank={rank} fontSize={fontSize} />
        </View>
        <PosterImage
          uri={drama.cover}
          accessibilityLabel={drama.title}
          radius={radii.md}
          style={[styles.poster, { width: posterWidth, marginLeft: offset }]}>
          {rank <= 3 && <Badge variant="gold" label="TOP" style={styles.top} />}
        </PosterImage>
      </View>
      {showTitle && (
        <AppText variant="label" numberOfLines={1} style={[styles.title, { marginLeft: offset }]}>
          {drama.title}
        </AppText>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  stage: { flexDirection: 'row', alignItems: 'flex-end' },
  numeral: { position: 'absolute', left: 0, bottom: 0 },
  poster: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  top: { position: 'absolute', top: spacing[2], right: spacing[2] },
  title: { marginTop: spacing[2] },
});
