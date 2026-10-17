import { useEffect } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';

import { PressableScale } from '@/components/ui/PressableScale';
import { colors, motion, radii, shadows, spacing, typography } from '@/theme';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  /** Small count pill next to the label. Omit to hide (e.g. before hydration). */
  count?: number;
  /** Screen reader noun for the count, e.g. "drama". */
  countNoun?: string;
}

export interface SegmentedControlProps<T extends string> {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  style?: StyleProp<ViewStyle>;
}

const PAD = 4;
const HEIGHT = 48;

interface SegmentProps {
  label: string;
  count?: number;
  index: number;
  progress: SharedValue<number>;
  selected: boolean;
  a11yLabel: string;
  onPress: () => void;
}

/** One tab: label + count pill whose colours are driven by the indicator position. */
function Segment({ label, count, index, progress, selected, a11yLabel, onPress }: SegmentProps) {
  const labelStyle = useAnimatedStyle(() => {
    const active = 1 - Math.min(1, Math.abs(progress.get() - index));
    return { color: interpolateColor(active, [0, 1], [colors.textMuted, colors.text]) };
  });
  const pillStyle = useAnimatedStyle(() => {
    const active = 1 - Math.min(1, Math.abs(progress.get() - index));
    return { backgroundColor: interpolateColor(active, [0, 1], [colors.surfaceAlt, colors.primarySoft]) };
  });
  const pillTextStyle = useAnimatedStyle(() => {
    const active = 1 - Math.min(1, Math.abs(progress.get() - index));
    return { color: interpolateColor(active, [0, 1], [colors.textMuted, colors.primary]) };
  });

  return (
    <PressableScale
      accessibilityRole="tab"
      accessibilityLabel={a11yLabel}
      accessibilityState={{ selected, disabled: false }}
      haptic="selection"
      activeScale={0.97}
      onPress={onPress}
      style={styles.segment}>
      <Animated.Text style={[styles.label, labelStyle]} numberOfLines={1}>
        {label}
      </Animated.Text>
      {count != null && (
        <Animated.View style={[styles.pill, pillStyle]}>
          <Animated.Text style={[styles.pillText, pillTextStyle]}>{count > 99 ? '99+' : count}</Animated.Text>
        </Animated.View>
      )}
    </PressableScale>
  );
}

/** Pill segmented control with a spring-driven sliding indicator. */
export function SegmentedControl<T extends string>({ options, value, onChange, style }: SegmentedControlProps<T>) {
  const activeIndex = Math.max(0, options.findIndex((o) => o.value === value));
  const progress = useSharedValue(activeIndex);
  const trackWidth = useSharedValue(0);

  useEffect(() => {
    progress.set(withSpring(activeIndex, motion.spring.gentle));
  }, [progress, activeIndex]);

  const indicatorStyle = useAnimatedStyle(() => {
    const segW = Math.max(0, (trackWidth.get() - PAD * 2) / options.length);
    return { width: segW, transform: [{ translateX: progress.get() * segW }] };
  });

  const onLayout = (e: LayoutChangeEvent) => trackWidth.set(e.nativeEvent.layout.width);

  return (
    <View accessibilityRole="tablist" onLayout={onLayout} style={[styles.track, style]}>
      <Animated.View style={[styles.indicator, indicatorStyle]} />
      {options.map((o, i) => (
        <Segment
          key={o.value}
          label={o.label}
          count={o.count}
          index={i}
          progress={progress}
          selected={i === activeIndex}
          a11yLabel={o.count != null ? `${o.label}, ${o.count} ${o.countNoun ?? 'item'}` : o.label}
          onPress={() => onChange(o.value)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: HEIGHT,
    flexDirection: 'row',
    padding: PAD,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  indicator: {
    position: 'absolute',
    pointerEvents: 'none',
    top: PAD,
    bottom: PAD,
    left: PAD,
    borderRadius: radii.pill,
    backgroundColor: colors.elevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    ...shadows.sm,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    borderRadius: radii.pill,
  },
  label: { ...typography.label, fontSize: 14 },
  pill: {
    minWidth: 22,
    height: 18,
    paddingHorizontal: spacing[1.5],
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillText: { ...typography.caption, fontSize: 11, lineHeight: 13 },
});
