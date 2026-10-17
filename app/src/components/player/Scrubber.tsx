import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { AppText } from '@/components/ui/AppText';
import { formatDuration } from '@/lib/format';
import { colors, gradients, motion, radii, spacing } from '@/theme';

export interface ScrubberProps {
  /** 0..1 playback progress, animated by the player. */
  progress: SharedValue<number>;
  duration: number;
  onSeek: (sec: number) => void;
  /**
   * true while the finger is down (pause playback + auto-hide, lock the pager). Always followed by
   * false — also when the gesture is cancelled or the scrubber unmounts mid-drag.
   */
  onScrubbingChange?: (scrubbing: boolean) => void;
}

const HIT_HEIGHT = 32;
const BUBBLE_W = 64;

/** Thin draggable progress bar with a time bubble while dragging. */
export function Scrubber({ progress, duration, onSeek, onScrubbingChange }: ScrubberProps) {
  const [trackW, setTrackW] = useState(0);
  const [dragSec, setDragSec] = useState(0);
  const width = useSharedValue(0);
  const dragging = useSharedValue(0);
  const dragRatio = useSharedValue(0);
  const lastSec = useSharedValue(-1);
  /** UI-thread mirror of "a pan is in progress", so a cancelled pan still reports scrubbing=false. */
  const panActive = useSharedValue(0);
  /** JS-side "scrubbing=true was reported" (a shared value so gesture callbacks may touch it). */
  const reported = useSharedValue(false);
  const onScrubbingChangeRef = useRef(onScrubbingChange);
  useEffect(() => {
    onScrubbingChangeRef.current = onScrubbingChange;
  });
  // Unmounting mid-drag (episode ended, overlay hidden) must not leave the pager locked.
  useEffect(
    () => () => {
      if (reported.get()) onScrubbingChangeRef.current?.(false);
    },
    [reported],
  );

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    width.set(w);
    setTrackW(w);
  };

  const begin = () => {
    reported.set(true);
    onScrubbingChange?.(true);
  };
  const cancel = () => {
    if (!reported.get()) return;
    reported.set(false);
    onScrubbingChange?.(false);
  };
  const finish = (ratio: number) => {
    cancel();
    if (duration > 0) onSeek(ratio * duration);
  };

  const pan = Gesture.Pan()
    .enabled(duration > 0)
    .activeOffsetX([-4, 4])
    .failOffsetY([-18, 18])
    .onStart((e) => {
      panActive.set(1);
      const w = width.get() || 1;
      const r = Math.min(1, Math.max(0, e.x / w));
      dragRatio.set(r);
      dragging.set(withSpring(1, motion.spring.press));
      lastSec.set(Math.floor(r * duration));
      scheduleOnRN(setDragSec, Math.floor(r * duration));
      scheduleOnRN(begin);
    })
    .onUpdate((e) => {
      const w = width.get() || 1;
      const r = Math.min(1, Math.max(0, e.x / w));
      dragRatio.set(r);
      const sec = Math.floor(r * duration);
      if (sec !== lastSec.get()) {
        lastSec.set(sec);
        scheduleOnRN(setDragSec, sec);
      }
    })
    .onEnd(() => {
      panActive.set(0);
      progress.set(dragRatio.get());
      scheduleOnRN(finish, dragRatio.get());
    })
    .onFinalize(() => {
      dragging.set(withTiming(0, { duration: motion.duration.normal }));
      if (panActive.get()) {
        panActive.set(0);
        scheduleOnRN(cancel);
      }
    });

  const tap = Gesture.Tap()
    .enabled(duration > 0)
    .maxDuration(400)
    .onEnd((e, success) => {
      if (!success) return;
      const w = width.get() || 1;
      const r = Math.min(1, Math.max(0, e.x / w));
      progress.set(r);
      scheduleOnRN(finish, r);
    });

  const gesture = Gesture.Race(pan, tap);

  const fillStyle = useAnimatedStyle(() => {
    const r = dragging.get() > 0.01 ? dragRatio.get() : progress.get();
    return { width: `${r * 100}%` };
  });
  const trackStyle = useAnimatedStyle(() => ({ height: 3 + dragging.get() * 3 }));
  const thumbStyle = useAnimatedStyle(() => {
    const r = dragging.get() > 0.01 ? dragRatio.get() : progress.get();
    return {
      transform: [{ translateX: r * width.get() - 7 }, { scale: 0.85 + dragging.get() * 0.45 }],
    };
  });
  const bubbleStyle = useAnimatedStyle(() => {
    const w = width.get();
    const x = Math.min(Math.max(dragRatio.get() * w - BUBBLE_W / 2, 0), Math.max(0, w - BUBBLE_W));
    return { opacity: dragging.get(), transform: [{ translateX: x }, { translateY: (1 - dragging.get()) * 6 }] };
  });

  return (
    <GestureDetector gesture={gesture}>
      <View
        style={styles.hit}
        onLayout={onLayout}
        accessibilityRole="adjustable"
        accessibilityLabel="Posisi video"
        accessibilityValue={{ text: formatDuration(duration) }}>
        <Animated.View pointerEvents="none" style={[styles.bubble, bubbleStyle]}>
          <AppText variant="label" weight="bold" tabular align="center">
            {formatDuration(dragSec)}
          </AppText>
        </Animated.View>
        <Animated.View style={[styles.track, trackStyle]}>
          <Animated.View style={[styles.fill, fillStyle]}>
            <LinearGradient
              colors={gradients.primary}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
        </Animated.View>
        {trackW > 0 && <Animated.View pointerEvents="none" style={[styles.thumb, thumbStyle]} />}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  hit: { height: HIT_HEIGHT, justifyContent: 'center' },
  track: {
    width: '100%',
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255,255,255,0.24)',
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: radii.pill, overflow: 'hidden' },
  thumb: {
    position: 'absolute',
    left: 0,
    top: HIT_HEIGHT / 2 - 7,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.white,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  bubble: {
    position: 'absolute',
    left: 0,
    bottom: HIT_HEIGHT - 2 + spacing[1],
    width: BUBBLE_W,
    paddingVertical: spacing[1],
    borderRadius: radii.sm,
    backgroundColor: colors.glassStrong,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassBorder,
  },
});
