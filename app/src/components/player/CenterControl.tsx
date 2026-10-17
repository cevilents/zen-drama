import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { GlassView } from '@/components/ui/GlassView';
import { PressableScale } from '@/components/ui/PressableScale';
import { colors, motion, radii } from '@/theme';

export interface CenterControlProps {
  /** Show the play/pause button (controls visible or paused). */
  visible: boolean;
  paused: boolean;
  buffering: boolean;
  onToggle: () => void;
}

const SIZE = 76;

/** Big center play/pause with a pop on toggle, plus the buffering spinner. */
export function CenterControl({ visible, paused, buffering, onToggle }: CenterControlProps) {
  const opacity = useSharedValue(visible ? 1 : 0);
  const scale = useSharedValue(1);
  const prevPaused = useRef(paused);

  useEffect(() => {
    opacity.set(withTiming(visible ? 1 : 0, { duration: motion.duration.fast }));
  }, [visible, opacity]);

  useEffect(() => {
    if (prevPaused.current === paused) return;
    prevPaused.current = paused;
    scale.set(withSequence(withTiming(0.78, { duration: 90 }), withSpring(1, { damping: 9, stiffness: 300 })));
  }, [paused, scale]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.get(), transform: [{ scale: scale.get() }] }));
  const showSpinner = buffering && !paused;

  return (
    <View pointerEvents="box-none" style={styles.center}>
      {showSpinner ? (
        <View pointerEvents="none" style={styles.spinner}>
          <ActivityIndicator size="large" color={colors.white} />
        </View>
      ) : (
        <Animated.View pointerEvents={visible ? 'auto' : 'none'} style={style}>
          <PressableScale
            onPress={onToggle}
            haptic="light"
            activeScale={0.9}
            accessibilityLabel={paused ? 'Putar' : 'Jeda'}
            style={styles.hit}>
            <GlassView style={styles.button} intensity={30} tint="rgba(10,10,14,0.38)">
              <Ionicons
                name={paused ? 'play' : 'pause'}
                size={34}
                color={colors.white}
                style={paused ? styles.playNudge : undefined}
              />
            </GlassView>
          </PressableScale>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  spinner: {
    width: SIZE,
    height: SIZE,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  hit: { width: SIZE, height: SIZE, borderRadius: radii.pill },
  button: {
    width: SIZE,
    height: SIZE,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassBorder,
  },
  playNudge: { marginLeft: 4 },
});
