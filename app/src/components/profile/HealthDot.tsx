import { useEffect } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

import { colors } from '@/theme';

export type HealthStatus = 'up' | 'down' | 'unknown' | 'loading';

export interface HealthDotProps {
  status: HealthStatus;
  size?: number;
  style?: StyleProp<ViewStyle>;
}

const TONE: Record<HealthStatus, string> = {
  up: colors.success,
  down: colors.danger,
  unknown: colors.textMuted,
  loading: colors.textMuted,
};

/** Small status dot. `loading` pulses; `up` carries a soft halo. */
export function HealthDot({ status, size = 8, style }: HealthDotProps) {
  const pulse = useSharedValue(1);

  useEffect(() => {
    if (status === 'loading') {
      pulse.set(
        withRepeat(
          withSequence(
            withTiming(0.25, { duration: 700, easing: Easing.inOut(Easing.quad) }),
            withTiming(1, { duration: 700, easing: Easing.inOut(Easing.quad) }),
          ),
          -1,
        ),
      );
    } else {
      pulse.set(withTiming(1, { duration: 160 }));
    }
  }, [status, pulse]);

  const animated = useAnimatedStyle(() => ({ opacity: pulse.get() }));

  return (
    <View aria-hidden style={[{ width: size + 6, height: size + 6 }, styles.center, style]}>
      {status === 'up' && (
        <View
          style={[
            StyleSheet.absoluteFill,
            { borderRadius: (size + 6) / 2, backgroundColor: colors.successSoft },
          ]}
        />
      )}
      <Animated.View
        style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: TONE[status] }, animated]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
});
