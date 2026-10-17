import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';
import Animated, { Extrapolation, interpolate, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassView } from '@/components/ui/GlassView';
import { IconButton } from '@/components/ui/IconButton';
import { colors, gradients, layout, spacing, zIndex } from '@/theme';

import { Wordmark } from './Wordmark';

export const TOP_BAR_HEIGHT = 56;

export interface HomeTopBarProps {
  /** Vertical scroll offset of the home list. */
  scrollY: SharedValue<number>;
  /** Scroll distance at which the bar is fully solid. */
  solidAt: number;
  onSearch: () => void;
}

/** Transparent over the hero; fades to frosted glass as the page scrolls. */
export function HomeTopBar({ scrollY, solidAt, onSearch }: HomeTopBarProps) {
  const insets = useSafeAreaInsets();
  const start = Math.max(0, solidAt - 140);

  const glassStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.get(), [start, solidAt], [0, 1], Extrapolation.CLAMP),
  }));
  const scrimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.get(), [start, solidAt], [1, 0], Extrapolation.CLAMP),
  }));

  return (
    <View pointerEvents="box-none" style={[styles.host, { height: insets.top + TOP_BAR_HEIGHT }]}>
      <Animated.View pointerEvents="none" style={[styles.scrim, scrimStyle]}>
        <LinearGradient colors={gradients.heroTop} style={StyleSheet.absoluteFill} />
      </Animated.View>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, glassStyle]}>
        <GlassView style={StyleSheet.absoluteFill} intensity={50} tint="rgba(7,7,10,0.78)" />
        <View style={styles.hairline} />
      </Animated.View>

      <View style={[styles.row, { marginTop: insets.top }]} pointerEvents="box-none">
        <Wordmark size={20} />
        <IconButton icon="search" accessibilityLabel="Cari drama" onPress={onSearch} size={40} iconSize={20} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: zIndex.overlay,
  },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: -36 },
  hairline: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  row: {
    height: TOP_BAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: layout.gutter,
    gap: spacing[3],
  },
});
