import { useEffect } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { IconButton } from '@/components/ui/IconButton';
import { motion, spacing, zIndex } from '@/theme';

export interface WebPagerArrowsProps {
  visible: boolean;
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  style?: StyleProp<ViewStyle>;
}

/** Web-only previous/next episode affordance (mouse users can't swipe). */
export function WebPagerArrows({ visible, canPrev, canNext, onPrev, onNext, style }: WebPagerArrowsProps) {
  const opacity = useSharedValue(visible ? 1 : 0);
  useEffect(() => {
    opacity.set(withTiming(visible ? 1 : 0.35, { duration: motion.duration.normal }));
  }, [visible, opacity]);
  const animated = useAnimatedStyle(() => ({ opacity: opacity.get() }));

  return (
    <Animated.View style={[styles.root, style, animated]}>
      <IconButton icon="chevron-up" size={40} accessibilityLabel="Episode sebelumnya" disabled={!canPrev} onPress={onPrev} />
      <IconButton icon="chevron-down" size={40} accessibilityLabel="Episode berikutnya" disabled={!canNext} onPress={onNext} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', gap: spacing[3], zIndex: zIndex.overlay },
});
