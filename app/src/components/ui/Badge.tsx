import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, gradients, radii } from '@/theme';

import { AppText } from './AppText';
import type { IoniconName } from './IconButton';

export type BadgeVariant = 'hot' | 'new' | 'completed' | 'episodes' | 'rank' | 'gold' | 'neutral';

export interface BadgeProps {
  /** Text. Defaults per variant: hot→"HOT", new→"BARU", completed→"TAMAT". */
  label?: string;
  variant?: BadgeVariant;
  icon?: IoniconName;
  size?: 'sm' | 'md';
  style?: StyleProp<ViewStyle>;
}

const DEFAULT_LABEL: Partial<Record<BadgeVariant, string>> = {
  hot: 'HOT',
  new: 'BARU',
  completed: 'TAMAT',
};

const DEFAULT_ICON: Partial<Record<BadgeVariant, IoniconName>> = {
  hot: 'flame',
  episodes: 'play',
};

/**
 * Tiny status pill for posters.
 * - hot: primary gradient + flame · new: green · completed: muted glass
 * - episodes: dark glass "EP 80" · rank/gold: gold gradient, dark text
 */
export function Badge({ label, variant = 'neutral', icon, size = 'sm', style }: BadgeProps) {
  const text = label ?? DEFAULT_LABEL[variant] ?? '';
  const glyph = icon ?? DEFAULT_ICON[variant];
  const isGold = variant === 'gold' || variant === 'rank';
  const fg = isGold ? colors.textInverse : variant === 'completed' ? colors.success : colors.white;
  const pad = size === 'sm' ? { paddingHorizontal: 6, height: 18 } : { paddingHorizontal: 8, height: 22 };

  const inner = (
    <View style={[styles.row, pad]}>
      {glyph && <Ionicons name={glyph} size={size === 'sm' ? 9 : 11} color={fg} />}
      <AppText variant="caption" weight={isGold ? 'extrabold' : 'bold'} color={fg} style={size === 'sm' && styles.smText}>
        {text}
      </AppText>
    </View>
  );

  if (variant === 'hot' || isGold) {
    return (
      <LinearGradient
        colors={variant === 'hot' ? gradients.primary : gradients.gold}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={[styles.base, style]}
        accessibilityLabel={text}>
        {inner}
      </LinearGradient>
    );
  }

  return (
    <View
      accessibilityLabel={text}
      style={[
        styles.base,
        variant === 'new' && { backgroundColor: colors.success },
        variant === 'completed' && styles.completed,
        variant === 'episodes' && styles.episodes,
        variant === 'neutral' && { backgroundColor: colors.elevated },
        style,
      ]}>
      {inner}
    </View>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: radii.xs, overflow: 'hidden', alignSelf: 'flex-start' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  smText: { fontSize: 10, lineHeight: 12, letterSpacing: 0.3 },
  completed: {
    backgroundColor: 'rgba(7,7,10,0.72)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(48,209,88,0.6)',
  },
  episodes: {
    backgroundColor: 'rgba(7,7,10,0.72)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassBorder,
  },
});
