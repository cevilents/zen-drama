import { forwardRef } from 'react';
import { Pressable, type GestureResponderEvent, type PressableProps, type StyleProp, type View, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { haptics } from '@/lib/haptics';
import { motion } from '@/theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface PressableScaleProps extends Omit<PressableProps, 'style'> {
  style?: StyleProp<ViewStyle>;
  /** Scale while pressed. Default 0.96. */
  activeScale?: number;
  /** Dim while pressed (0..1). Default 1 (no dim). */
  activeOpacity?: number;
  /** Fire selection haptic on press. */
  haptic?: boolean | 'light' | 'medium' | 'selection';
}

/**
 * Pressable with a springy scale-down. The base primitive for every tappable surface.
 * Accepts all Pressable props (onPress, onLongPress, accessibilityLabel, hitSlop, ...).
 */
export const PressableScale = forwardRef<View, PressableScaleProps>(function PressableScale(
  {
    activeScale = motion.pressScale,
    activeOpacity = 1,
    haptic,
    style,
    onPressIn,
    onPressOut,
    onPress,
    disabled,
    accessibilityRole = 'button',
    ...rest
  },
  ref,
) {
  const pressed = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => {
    const p = pressed.get();
    return {
      transform: [{ scale: 1 - (1 - activeScale) * p }],
      opacity: 1 - (1 - activeOpacity) * p,
    };
  });

  const handlePressIn = (e: GestureResponderEvent) => {
    pressed.set(withSpring(1, motion.spring.press));
    onPressIn?.(e);
  };
  const handlePressOut = (e: GestureResponderEvent) => {
    pressed.set(withTiming(0, { duration: motion.duration.normal, easing: motion.easing.decelerate }));
    onPressOut?.(e);
  };
  const handlePress = (e: GestureResponderEvent) => {
    if (haptic) {
      const kind = haptic === true ? 'selection' : haptic;
      haptics[kind]();
    }
    onPress?.(e);
  };

  return (
    <AnimatedPressable
      ref={ref}
      accessibilityRole={accessibilityRole}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={handlePress}
      style={[style, animatedStyle]}
      {...rest}
    />
  );
});
