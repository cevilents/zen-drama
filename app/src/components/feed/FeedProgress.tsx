import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { gradients, radii } from '@/theme';

import { onVideo } from './overlay';

export interface FeedProgressProps {
  /** 0..1 playback position, driven from onProgress. */
  progress: SharedValue<number>;
  /** Shows an indeterminate sweep instead of the fill. */
  buffering: boolean;
  style?: StyleProp<ViewStyle>;
}

/** Hairline playback progress pinned just above the tab bar; sweeps while loading. */
export function FeedProgress({ progress, buffering, style }: FeedProgressProps) {
  const sweep = useSharedValue(0);

  useEffect(() => {
    if (buffering) {
      sweep.set(0);
      sweep.set(withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }), -1, false));
    } else {
      cancelAnimation(sweep);
      sweep.set(0);
    }
    return () => cancelAnimation(sweep);
  }, [buffering, sweep]);

  const fillStyle = useAnimatedStyle(() => ({ width: `${Math.min(1, Math.max(0, progress.get())) * 100}%` }));
  const sweepStyle = useAnimatedStyle(() => {
    const p = sweep.get();
    return {
      left: `${-30 + p * 130}%`,
      opacity: buffering ? 1 - Math.abs(p - 0.5) * 0.8 : 0,
    };
  });

  return (
    <View pointerEvents="none" style={[styles.track, style]} aria-hidden>
      {!buffering && (
        <Animated.View style={[styles.fill, fillStyle]}>
          <LinearGradient
            colors={gradients.primary}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      )}
      {buffering && <Animated.View style={[styles.sweep, sweepStyle]} />}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 2,
    borderRadius: radii.pill,
    backgroundColor: onVideo.track,
    overflow: 'hidden',
  },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: radii.pill, overflow: 'hidden' },
  sweep: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: '30%',
    borderRadius: radii.pill,
    backgroundColor: onVideo.textDim,
  },
});
