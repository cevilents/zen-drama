import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { colors } from '@/theme';

const SIZE = 96;

export interface HeartBurstProps {
  id: number;
  x: number;
  y: number;
  /** Degrees; small random tilt keeps repeated taps lively. */
  tilt: number;
  /** Must be stable (e.g. useCallback); called with `id` when the animation ends. */
  onDone: (id: number) => void;
}

/** Double-tap "like" heart that pops at the tap point, floats up and fades out. */
export function HeartBurst({ id, x, y, tilt, onDone }: HeartBurstProps) {
  const p = useSharedValue(0);

  useEffect(() => {
    p.set(
      withTiming(1, { duration: 820, easing: Easing.out(Easing.cubic) }, (finished) => {
        if (finished) scheduleOnRN(onDone, id);
      }),
    );
  }, [p, onDone, id]);

  const style = useAnimatedStyle(() => {
    const t = p.get();
    // 0–0.18: pop in with overshoot · 0.18–0.55: settle · 0.55–1: drift up and fade.
    const scale = t < 0.18 ? 0.4 + (t / 0.18) * 0.9 : t < 0.55 ? 1.3 - ((t - 0.18) / 0.37) * 0.25 : 1.05 + (t - 0.55) * 0.5;
    const opacity = t < 0.55 ? 1 : 1 - (t - 0.55) / 0.45;
    return {
      opacity,
      transform: [{ translateY: t < 0.55 ? 0 : -(t - 0.55) * 120 }, { rotate: `${tilt}deg` }, { scale }],
    };
  });

  return (
    <Animated.View pointerEvents="none" style={[styles.burst, { left: x - SIZE / 2, top: y - SIZE / 2 }, style]}>
      <Ionicons name="heart" size={SIZE} color={colors.primary} style={styles.glyph} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  burst: { position: 'absolute', width: SIZE, height: SIZE },
  glyph: {
    textShadowColor: 'rgba(255,45,85,0.55)',
    textShadowRadius: 18,
    textShadowOffset: { width: 0, height: 4 },
  },
});
