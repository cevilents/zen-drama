import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { gradients, radii } from '@/theme';

export interface ProgressBarProps {
  /** 0..1 */
  progress: number;
  height?: number;
  trackColor?: string;
  style?: StyleProp<ViewStyle>;
}

/** Thin primary-gradient progress bar (watch progress on posters). */
export function ProgressBar({ progress, height = 3, trackColor = 'rgba(255,255,255,0.22)', style }: ProgressBarProps) {
  const pct = Math.min(1, Math.max(0, progress || 0));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(pct * 100) }}
      style={[styles.track, { height, backgroundColor: trackColor }, style]}>
      <LinearGradient
        colors={gradients.primary}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={[styles.fill, { width: `${pct * 100}%` }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { width: '100%', borderRadius: radii.pill, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radii.pill },
});
