import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, gradients, radii, spacing } from '@/theme';

import { AppText } from './AppText';
import type { IoniconName } from './IconButton';
import { PressableScale } from './PressableScale';

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: IoniconName;
  /** "md" = 36pt tall (tap target padded to 44 via hitSlop), "sm" = 28pt static tag. */
  size?: 'sm' | 'md';
  /** Non-interactive tag (e.g. genre tags on detail). */
  static?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

/** Selectable pill for genres, sources, filters. Selected = primary gradient fill. */
export function Chip({ label, selected, onPress, icon, size = 'md', static: isStatic, style, accessibilityLabel }: ChipProps) {
  const height = size === 'md' ? 36 : 28;
  const fg = selected ? colors.white : colors.textSecondary;
  const inner = (
    <View style={[styles.row, { height, paddingHorizontal: size === 'md' ? spacing[4] : spacing[3] }]}>
      {icon && <Ionicons name={icon} size={size === 'md' ? 15 : 13} color={fg} />}
      <AppText variant={size === 'md' ? 'label' : 'caption'} color={fg} numberOfLines={1}>
        {label}
      </AppText>
    </View>
  );

  const body = selected ? (
    <LinearGradient colors={gradients.primary} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.pill}>
      {inner}
    </LinearGradient>
  ) : (
    <View style={[styles.pill, styles.idle]}>{inner}</View>
  );

  if (isStatic || !onPress) {
    return (
      <View style={style} accessibilityLabel={accessibilityLabel ?? label}>
        {body}
      </View>
    );
  }

  return (
    <PressableScale
      onPress={onPress}
      haptic="selection"
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected: !!selected }}
      hitSlop={{ top: (44 - height) / 2, bottom: (44 - height) / 2, left: 2, right: 2 }}
      style={style}>
      {body}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  pill: { borderRadius: radii.pill, overflow: 'hidden' },
  idle: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[1.5] },
});
