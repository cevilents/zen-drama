import { BlurView } from 'expo-blur';
import type { ReactNode } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors } from '@/theme';

export interface GlassViewProps {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Blur strength (native). Default 40. */
  intensity?: number;
  /** Fallback/tint fill drawn on top of the blur. */
  tint?: string;
  pointerEvents?: 'auto' | 'none' | 'box-none' | 'box-only';
}

/**
 * Frosted-glass container. Native: expo-blur. Web: CSS backdrop-filter on a translucent fill.
 * Android blur is opt-in in expo-blur and costly, so Android gets a denser translucent fill.
 */
export function GlassView({ children, style, intensity = 40, tint, pointerEvents }: GlassViewProps) {
  if (Platform.OS === 'web') {
    return (
      <View
        pointerEvents={pointerEvents}
        style={[
          {
            backgroundColor: tint ?? colors.glass,
            backdropFilter: `blur(${Math.round(intensity / 2)}px) saturate(160%)`,
            WebkitBackdropFilter: `blur(${Math.round(intensity / 2)}px) saturate(160%)`,
          } as ViewStyle,
          style,
        ]}>
        {children}
      </View>
    );
  }

  if (Platform.OS === 'android') {
    return (
      <View pointerEvents={pointerEvents} style={[{ backgroundColor: tint ?? colors.glassStrong }, style]}>
        {children}
      </View>
    );
  }

  return (
    <View pointerEvents={pointerEvents} style={[styles.clip, style]}>
      <BlurView intensity={intensity} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: tint ?? 'rgba(14,14,18,0.35)' }]} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
});
