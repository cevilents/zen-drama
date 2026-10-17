import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, gradients, radii, shadows, spacing } from '@/theme';

import { AppText } from './AppText';
import type { IoniconName } from './IconButton';
import { PressableScale } from './PressableScale';

export type GradientButtonVariant = 'primary' | 'gold' | 'secondary' | 'ghost';
export type GradientButtonSize = 'md' | 'lg';

export interface GradientButtonProps {
  label: string;
  onPress?: () => void;
  icon?: IoniconName;
  iconPosition?: 'left' | 'right';
  variant?: GradientButtonVariant;
  size?: GradientButtonSize;
  loading?: boolean;
  disabled?: boolean;
  /** Stretch to container width. */
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

/** Primary CTA ("Tonton Sekarang", "Lanjutkan EP 5"). */
export function GradientButton({
  label,
  onPress,
  icon,
  iconPosition = 'left',
  variant = 'primary',
  size = 'lg',
  loading,
  disabled,
  fullWidth,
  style,
  accessibilityLabel,
  accessibilityHint,
}: GradientButtonProps) {
  const height = size === 'lg' ? 52 : 44;
  const fg = variant === 'gold' ? colors.textInverse : colors.text;
  const isGradient = variant === 'primary' || variant === 'gold';
  const inactive = disabled || loading;

  const content = (
    <View style={[styles.row, { height, paddingHorizontal: size === 'lg' ? spacing[6] : spacing[4] }]}>
      {loading ? (
        <ActivityIndicator color={fg} size="small" />
      ) : (
        <>
          {icon && iconPosition === 'left' && <Ionicons name={icon} size={size === 'lg' ? 20 : 18} color={fg} />}
          <AppText variant={size === 'lg' ? 'bodyMedium' : 'label'} weight="bold" color={fg} numberOfLines={1}>
            {label}
          </AppText>
          {icon && iconPosition === 'right' && <Ionicons name={icon} size={size === 'lg' ? 20 : 18} color={fg} />}
        </>
      )}
    </View>
  );

  return (
    <PressableScale
      onPress={onPress}
      disabled={inactive}
      haptic="medium"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      activeScale={0.97}
      style={[
        styles.base,
        fullWidth && styles.full,
        variant === 'primary' && !inactive && shadows.glow,
        disabled && styles.disabled,
        style,
      ]}>
      {isGradient ? (
        <LinearGradient
          colors={variant === 'gold' ? gradients.gold : gradients.primary}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.fill}>
          {content}
        </LinearGradient>
      ) : (
        <View
          style={[
            styles.fill,
            variant === 'secondary' && styles.secondary,
            variant === 'ghost' && styles.ghost,
          ]}>
          {content}
        </View>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: radii.pill, alignSelf: 'flex-start' },
  full: { alignSelf: 'stretch' },
  fill: { borderRadius: radii.pill, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing[2] },
  secondary: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
  ghost: { backgroundColor: 'transparent' },
  disabled: { opacity: 0.45 },
});
