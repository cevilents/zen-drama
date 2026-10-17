import { useEffect } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { colors, radii } from '@/theme';

export interface EqBarsProps {
  /** Overall height in pt. Default 10. */
  size?: number;
  color?: string;
  /** Freeze the bars (e.g. paused). Default true = animating. */
  playing?: boolean;
  style?: StyleProp<ViewStyle>;
}

const BAR_PATTERN = [
  { delay: 0, low: 0.3, duration: 380 },
  { delay: 120, low: 0.45, duration: 300 },
  { delay: 60, low: 0.25, duration: 440 },
];

function Bar({ value, width, height, color }: { value: SharedValue<number>; width: number; height: number; color: string }) {
  const style = useAnimatedStyle(() => ({ transform: [{ scaleY: value.get() }] }));
  return (
    <Animated.View
      style={[
        { width, height, backgroundColor: color, borderRadius: radii.pill, transformOrigin: 'bottom' },
        style,
      ]}
    />
  );
}

/** Tiny "now playing" equalizer glyph used on the current episode tile. */
export function EqBars({ size = 10, color = colors.white, playing = true, style }: EqBarsProps) {
  const a = useSharedValue(0.6);
  const b = useSharedValue(0.9);
  const c = useSharedValue(0.5);

  useEffect(() => {
    const values = [a, b, c];
    values.forEach((v, i) => {
      const p = BAR_PATTERN[i];
      if (!playing) {
        cancelAnimation(v);
        v.set(withTiming(0.4, { duration: 160 }));
        return;
      }
      v.set(
        withDelay(
          p.delay,
          withRepeat(
            withSequence(
              withTiming(1, { duration: p.duration, easing: Easing.inOut(Easing.quad) }),
              withTiming(p.low, { duration: p.duration, easing: Easing.inOut(Easing.quad) }),
            ),
            -1,
            true,
          ),
        ),
      );
    });
    return () => values.forEach((v) => cancelAnimation(v));
  }, [a, b, c, playing]);

  const barW = Math.max(2, Math.round(size / 4.5));
  return (
    <View aria-hidden style={[styles.row, { height: size, gap: Math.max(1, Math.round(barW / 2)) }, style]}>
      <Bar value={a} width={barW} height={size} color={color} />
      <Bar value={b} width={barW} height={size} color={color} />
      <Bar value={c} width={barW} height={size} color={color} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end' },
});
