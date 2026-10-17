import { useEffect, type ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { motion } from '@/theme';

export interface FadeInProps {
  children?: ReactNode;
  /** Stagger delay in ms (e.g. index * 40). */
  delay?: number;
  /** Slide up a few points while fading. Default true. */
  rise?: boolean;
  duration?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Mount-time fade (+ subtle rise). Use for sections and list items on first render.
 * Driven by shared values rather than layout `entering` animations, which on web start at
 * `visibility: hidden` and can stay hidden if the tab is backgrounded.
 */
export function FadeIn({ children, delay = 0, rise = true, duration = motion.duration.slow, style }: FadeInProps) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.set(withDelay(delay, withTiming(1, { duration, easing: motion.easing.decelerate })));
  }, [progress, delay, duration]);

  const animatedStyle = useAnimatedStyle(() => {
    const p = progress.get();
    return {
      opacity: p,
      transform: rise ? [{ translateY: (1 - p) * 12 }] : [],
    };
  });

  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
}
