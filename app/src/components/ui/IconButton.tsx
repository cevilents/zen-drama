import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radii } from '@/theme';

import { GlassView } from './GlassView';
import { PressableScale } from './PressableScale';

export type IoniconName = ComponentProps<typeof Ionicons>['name'];

export type IconButtonVariant = 'glass' | 'solid' | 'ghost' | 'primary';

export interface IconButtonProps {
  icon: IoniconName;
  onPress?: () => void;
  /** Required for screen readers. */
  accessibilityLabel: string;
  variant?: IconButtonVariant;
  /** Visual diameter. Tap target is always >= 44 via hitSlop. Default 40. */
  size?: number;
  iconSize?: number;
  color?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Marks toggle buttons (e.g. favorite) as selected for a11y. */
  selected?: boolean;
  haptic?: boolean;
}

export function IconButton({
  icon,
  onPress,
  accessibilityLabel,
  variant = 'glass',
  size = 40,
  iconSize,
  color,
  disabled,
  style,
  selected,
  haptic = true,
}: IconButtonProps) {
  const slop = Math.max(0, (44 - size) / 2);
  const glyph = <Ionicons name={icon} size={iconSize ?? Math.round(size * 0.5)} color={color ?? colors.text} />;
  const shape: ViewStyle = { width: size, height: size, borderRadius: radii.pill };

  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      haptic={haptic ? 'light' : false}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled, selected }}
      hitSlop={slop}
      activeScale={0.9}
      style={[shape, disabled && styles.disabled, style]}>
      {variant === 'glass' ? (
        <GlassView style={[shape, styles.center, styles.glassBorder]} intensity={30}>
          {glyph}
        </GlassView>
      ) : (
        <View
          style={[
            shape,
            styles.center,
            variant === 'solid' && { backgroundColor: colors.elevated },
            variant === 'primary' && { backgroundColor: colors.primary },
          ]}>
          {glyph}
        </View>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  glassBorder: { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder },
  disabled: { opacity: 0.4 },
});
