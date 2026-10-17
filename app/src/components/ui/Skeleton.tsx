import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { StyleSheet, View, type DimensionValue, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { colors, gradients, motion, radii } from '@/theme';

export interface ShimmerProps {
  style?: StyleProp<ViewStyle>;
}

/** Animated light sweep. Fills its parent (absolute). Parent must clip (overflow hidden). */
export function Shimmer({ style }: ShimmerProps) {
  const [width, setWidth] = useState(0);
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.set(
      withRepeat(withTiming(1, { duration: motion.duration.shimmer, easing: Easing.inOut(Easing.ease) }), -1, false),
    );
    return () => cancelAnimation(progress);
  }, [progress]);

  const animatedStyle = useAnimatedStyle(() => {
    const w = width || 200;
    return { transform: [{ translateX: -w + progress.get() * w * 2 }] };
  });

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, style]} onLayout={onLayout}>
      <Animated.View style={[StyleSheet.absoluteFill, animatedStyle]}>
        <LinearGradient
          colors={gradients.shimmer}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  );
}

export interface SkeletonProps {
  width?: DimensionValue;
  height?: DimensionValue;
  /** Corner radius. Default radii.sm. Use radii.pill for circles/lines. */
  radius?: number;
  /** Aspect ratio instead of fixed height (e.g. 3/4 for posters). */
  aspectRatio?: number;
  style?: StyleProp<ViewStyle>;
  /** Disable the sweep (e.g. for very long lists). */
  shimmer?: boolean;
}

/** Placeholder block with an animated shimmer. */
export function Skeleton({ width = '100%', height, radius = radii.sm, aspectRatio, style, shimmer = true }: SkeletonProps) {
  return (
    <View
      aria-hidden
      style={[
        styles.base,
        { width, height: height ?? (aspectRatio ? undefined : 14), borderRadius: radius, aspectRatio },
        style,
      ]}>
      {shimmer && <Shimmer />}
    </View>
  );
}

const styles = StyleSheet.create({
  base: { backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
});

