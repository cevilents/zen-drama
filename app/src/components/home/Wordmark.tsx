import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Text as SvgText } from 'react-native-svg';

import { colors, fonts, gradients } from '@/theme';

export interface WordmarkProps {
  /** Font size; the caps are ~0.75 of it. Default 20. */
  size?: number;
}

// Advance widths in em, measured from the Plus Jakarta Sans TTFs (800 for ZEN, 500 for DRAMA).
const ZEN_EM = 1.898;
const DRAMA_EM = 3.588;
const GAP_EM = 0.3;
const TRACKING_EM = 0.14;
const WIDTH_EM = ZEN_EM + GAP_EM + DRAMA_EM + TRACKING_EM * 4;

/**
 * "ZEN DRAMA" logotype: a heavy gradient "ZEN" against a lighter, widely tracked "DRAMA",
 * so the calm half and the drama half read as two voices of one mark.
 */
export function Wordmark({ size = 20 }: WordmarkProps) {
  const width = Math.ceil(size * WIDTH_EM);
  const height = size;
  const baseline = size * 0.87;
  const [from, to] = gradients.primary;

  return (
    <View
      accessible
      accessibilityRole="header"
      accessibilityLabel="ZEN DRAMA"
      style={[styles.box, { width, height }]}>
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id="zenWord" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={from} />
            <Stop offset="1" stopColor={to} />
          </LinearGradient>
        </Defs>
        <SvgText
          x={0}
          y={baseline}
          fontFamily={fonts.extrabold}
          fontWeight="800"
          fontSize={size}
          fill="url(#zenWord)">
          ZEN
        </SvgText>
        <SvgText
          x={size * (ZEN_EM + GAP_EM)}
          y={baseline}
          fontFamily={fonts.medium}
          fontWeight="500"
          fontSize={size}
          letterSpacing={size * TRACKING_EM}
          fill={colors.text}>
          DRAMA
        </SvgText>
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { justifyContent: 'center' },
});
