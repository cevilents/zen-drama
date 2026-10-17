import { Platform, type ViewStyle } from 'react-native';
import { Easing } from 'react-native-reanimated';

/** 4-pt spacing scale. `spacing[4]` = 16. */
export const spacing = {
  0: 0,
  0.5: 2,
  1: 4,
  1.5: 6,
  2: 8,
  2.5: 10,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  7: 28,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
  20: 80,
} as const;

export const radii = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

/** Horizontal page gutter used by every screen. */
export const layout = {
  gutter: 16,
  tabBarHeight: 64,
  /** Floating tab bar offset from the bottom safe-area edge. */
  tabBarInset: 10,
  minTapTarget: 44,
  posterAspect: 3 / 4,
  maxContentWidth: 640,
} as const;

function shadow(
  elevation: number,
  opacity: number,
  radius: number,
  offsetY: number,
  color = '#000',
): ViewStyle {
  return Platform.select<ViewStyle>({
    web: {
      boxShadow: `0px ${offsetY}px ${radius}px rgba(0,0,0,${opacity})`,
    } as ViewStyle,
    default: {
      shadowColor: color,
      shadowOpacity: opacity,
      shadowRadius: radius,
      shadowOffset: { width: 0, height: offsetY },
      elevation,
    },
  });
}

export const shadows = {
  none: {} as ViewStyle,
  sm: shadow(2, 0.25, 6, 2),
  md: shadow(6, 0.35, 14, 6),
  lg: shadow(12, 0.45, 28, 12),
  /** Coloured glow under primary CTAs. */
  glow: Platform.select<ViewStyle>({
    web: { boxShadow: '0px 8px 24px rgba(255,45,85,0.35)' } as ViewStyle,
    default: {
      shadowColor: '#FF2D55',
      shadowOpacity: 0.45,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 8,
    },
  }),
} as const;

export const motion = {
  duration: {
    instant: 90,
    fast: 160,
    normal: 240,
    slow: 360,
    slower: 520,
    shimmer: 1300,
  },
  easing: {
    standard: Easing.bezier(0.2, 0, 0, 1),
    decelerate: Easing.bezier(0, 0, 0, 1),
    accelerate: Easing.bezier(0.3, 0, 1, 1),
    emphasized: Easing.bezier(0.2, 0, 0, 1.0),
  },
  spring: {
    press: { damping: 18, stiffness: 320, mass: 0.6 },
    gentle: { damping: 20, stiffness: 180, mass: 0.9 },
    sheet: { damping: 26, stiffness: 260, mass: 0.9 },
  },
  pressScale: 0.96,
} as const;

export const zIndex = {
  base: 0,
  raised: 10,
  overlay: 100,
  sheet: 200,
  toast: 300,
} as const;
