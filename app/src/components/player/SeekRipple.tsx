import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { AppText } from '@/components/ui/AppText';
import { colors } from '@/theme';

export interface SeekRippleState {
  id: number;
  side: 'left' | 'right';
  /** Accumulated seconds for rapid repeated double-taps. */
  amount: number;
}

export interface SeekRippleProps {
  ripple: SeekRippleState | null;
  width: number;
  height: number;
}

/** YouTube-style half-moon flash with chevrons on double-tap seek. */
export function SeekRipple({ ripple, width, height }: SeekRippleProps) {
  if (!ripple) return null;
  return <Ripple key={ripple.id} ripple={ripple} width={width} height={height} />;
}

function Ripple({ ripple, width, height }: { ripple: SeekRippleState; width: number; height: number }) {
  const flash = useSharedValue(0);
  const wave = useSharedValue(0);

  useEffect(() => {
    flash.set(
      withSequence(
        withTiming(1, { duration: 120, easing: Easing.out(Easing.quad) }),
        withDelay(420, withTiming(0, { duration: 260 })),
      ),
    );
    wave.set(withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) }));
  }, [flash, wave]);

  const right = ripple.side === 'right';
  const panelW = width * 0.42;
  const circle = Math.max(height * 1.1, panelW * 2.4);

  const panelStyle = useAnimatedStyle(() => ({ opacity: flash.get() }));
  const waveStyle = useAnimatedStyle(() => ({
    opacity: (1 - wave.get()) * 0.35,
    transform: [{ scale: 0.2 + wave.get() * 0.8 }],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.panel, { width: panelW }, right ? styles.right : styles.left, panelStyle]}>
      <View
        style={[
          styles.moon,
          {
            width: circle,
            height: circle,
            borderRadius: circle / 2,
            top: (height - circle) / 2,
            [right ? 'left' : 'right']: 0,
          },
        ]}
      />
      <Animated.View style={[styles.wave, waveStyle]} />
      <View style={styles.label}>
        <View style={[styles.chevrons, !right && styles.flip]}>
          <Ionicons name="play" size={14} color={colors.white} style={styles.c1} />
          <Ionicons name="play" size={14} color={colors.white} style={styles.c2} />
          <Ionicons name="play" size={14} color={colors.white} />
        </View>
        <AppText variant="label" weight="bold" tabular style={styles.text}>
          {right ? '+' : '−'}
          {ripple.amount} detik
        </AppText>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  panel: { position: 'absolute', top: 0, bottom: 0, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  left: { left: 0 },
  right: { right: 0 },
  moon: { position: 'absolute', backgroundColor: 'rgba(255,255,255,0.13)' },
  wave: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: colors.white,
  },
  label: { alignItems: 'center', gap: 6 },
  chevrons: { flexDirection: 'row' },
  flip: { transform: [{ scaleX: -1 }] },
  c1: { opacity: 0.45, marginRight: -3 },
  c2: { opacity: 0.7, marginRight: -3 },
  text: {
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowRadius: 6,
    textShadowOffset: { width: 0, height: 1 },
  },
});
