import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { FadeIn } from '@/components/ui/FadeIn';
import { GradientButton, type GradientButtonVariant } from '@/components/ui/GradientButton';
import type { IoniconName } from '@/components/ui/IconButton';
import { colors, radii, spacing } from '@/theme';

export interface EmptyStateProps {
  icon?: IoniconName;
  /** Accent for the icon halo. Default primary. */
  tone?: 'primary' | 'gold' | 'muted';
  title: string;
  message?: string;
  actionLabel?: string;
  actionIcon?: IoniconName;
  onAction?: () => void;
  actionVariant?: GradientButtonVariant;
  /** Extra content under the action (e.g. secondary link). */
  footer?: ReactNode;
  /** Less vertical padding, for inline/section use. */
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}

const TONES = {
  primary: { fg: colors.primary, halo: ['rgba(255,45,85,0.28)', 'rgba(255,106,61,0.06)'] as const },
  gold: { fg: colors.gold, halo: ['rgba(245,184,65,0.28)', 'rgba(224,155,45,0.06)'] as const },
  muted: { fg: colors.textSecondary, halo: ['rgba(255,255,255,0.12)', 'rgba(255,255,255,0.02)'] as const },
};

export function EmptyState({
  icon = 'film-outline',
  tone = 'primary',
  title,
  message,
  actionLabel,
  actionIcon,
  onAction,
  actionVariant = 'primary',
  footer,
  compact,
  style,
}: EmptyStateProps) {
  const t = TONES[tone];
  return (
    <FadeIn style={[styles.root, compact ? styles.compact : styles.full, style]}>
      <LinearGradient colors={t.halo} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={styles.halo}>
        <View style={styles.iconInner}>
          <Ionicons name={icon} size={30} color={t.fg} />
        </View>
      </LinearGradient>
      <AppText variant="h3" align="center" style={styles.title} accessibilityRole="header">
        {title}
      </AppText>
      {message && (
        <AppText variant="bodySm" color="textSecondary" align="center" style={styles.message}>
          {message}
        </AppText>
      )}
      {actionLabel && onAction && (
        <GradientButton
          label={actionLabel}
          icon={actionIcon}
          onPress={onAction}
          size="md"
          variant={actionVariant}
          style={styles.action}
        />
      )}
      {footer}
    </FadeIn>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', paddingHorizontal: spacing[8] },
  full: { flex: 1, justifyContent: 'center', paddingVertical: spacing[12] },
  compact: { paddingVertical: spacing[8] },
  halo: {
    width: 84,
    height: 84,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[5],
  },
  iconInner: {
    width: 64,
    height: 64,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  title: { maxWidth: 320 },
  message: { marginTop: spacing[2], maxWidth: 320 },
  action: { marginTop: spacing[6], alignSelf: 'center' },
});
