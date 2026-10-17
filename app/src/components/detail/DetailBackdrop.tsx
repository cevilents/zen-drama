import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { Extrapolation, interpolate, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { PosterImage } from '@/components/drama/PosterImage';
import { colors, gradients } from '@/theme';

export interface DetailBackdropProps {
  /** Poster used as the blurred backdrop. Omit while loading or when missing. */
  cover?: string;
  scrollY: SharedValue<number>;
}

const MAX_HEIGHT = 520;
const PARALLAX = 0.5;
const BASE_SCALE = 1.15;

/**
 * Blurred, scaled-up cover behind the whole screen. Scrolls at half speed, fades out as the
 * content takes over and stretches from the top when the list is pulled down (iOS overscroll).
 */
export function DetailBackdrop({ cover, scrollY }: DetailBackdropProps) {
  const { height: windowHeight } = useWindowDimensions();
  const height = Math.min(MAX_HEIGHT, windowHeight * 0.58);

  const animatedStyle = useAnimatedStyle(() => {
    const y = scrollY.get();
    return {
      opacity: interpolate(y, [0, height * 0.9], [1, 0], Extrapolation.CLAMP),
      transform: [
        { translateY: interpolate(y, [0, height], [0, -height * PARALLAX], Extrapolation.CLAMP) },
        { scale: interpolate(y, [-height, 0], [2, 1], Extrapolation.CLAMP) },
      ],
    };
  });

  return (
    <Animated.View pointerEvents="none" aria-hidden style={[styles.root, { height }, animatedStyle]}>
      {cover ? (
        <View style={styles.image}>
          <PosterImage uri={cover} radius={0} blurRadius={28} transition={400} priority="high" style={StyleSheet.absoluteFill} />
        </View>
      ) : (
        <View style={styles.placeholder} />
      )}
      <LinearGradient colors={gradients.heroTop} style={styles.top} />
      <LinearGradient colors={gradients.heroBottom} locations={[0, 0.55, 1]} style={styles.bottom} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', top: 0, left: 0, right: 0, overflow: 'hidden', transformOrigin: 'top' },
  image: { ...StyleSheet.absoluteFill, transform: [{ scale: BASE_SCALE }] },
  placeholder: { ...StyleSheet.absoluteFill, backgroundColor: colors.surface },
  top: { position: 'absolute', top: 0, left: 0, right: 0, height: 140 },
  bottom: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '70%' },
});
