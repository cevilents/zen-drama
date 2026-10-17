import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Switch, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import type { IoniconName } from '@/components/ui/IconButton';
import { haptics } from '@/lib/haptics';
import { colors, layout, radii, spacing } from '@/theme';

const TILE = 32;
const GAP = spacing[3];
/** Left offset of the text column from the icon tile start; separators inset by this much. */
export const ROW_INSET = TILE + GAP;

export type SettingsTone = 'primary' | 'primaryAlt' | 'gold' | 'success' | 'neutral' | 'danger';

const TONE_COLOR: Record<SettingsTone, string> = {
  primary: colors.primary,
  primaryAlt: colors.primaryAlt,
  gold: colors.gold,
  success: colors.success,
  neutral: colors.textSecondary,
  danger: colors.danger,
};

export type SettingsRowVariant = 'navigate' | 'switch' | 'destructive' | 'info';

export interface SettingsRowProps {
  variant?: SettingsRowVariant;
  icon: IoniconName;
  tone?: SettingsTone;
  title: string;
  subtitle?: string;
  /** Right-aligned secondary value (e.g. "1,25x"). */
  value?: string;
  /** Custom content under the text block (status lines etc.). */
  footer?: ReactNode;
  onPress?: () => void;
  /** `switch` variant. */
  switchValue?: boolean;
  onSwitchChange?: (next: boolean) => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

/**
 * One row of a `SettingsGroup`. `navigate`/`destructive` are pressable (highlight flash),
 * `switch`/`info` are plain Views so a Switch is never nested inside a Pressable on web.
 */
export function SettingsRow({
  variant = 'navigate',
  icon,
  tone,
  title,
  subtitle,
  value,
  footer,
  onPress,
  switchValue,
  onSwitchChange,
  accessibilityLabel,
  accessibilityHint,
}: SettingsRowProps) {
  const resolvedTone: SettingsTone = tone ?? (variant === 'destructive' ? 'danger' : 'neutral');
  const tint = TONE_COLOR[resolvedTone];
  const isSwitch = variant === 'switch';
  const pressable = variant === 'navigate' || variant === 'destructive';

  const body = (
    <>
      <View style={styles.tile} aria-hidden>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: tint, opacity: 0.16 }]} />
        <Ionicons name={icon} size={18} color={tint} />
      </View>

      <View style={styles.texts} aria-hidden={isSwitch}>
        <AppText
          variant="title"
          color={variant === 'destructive' ? 'danger' : 'text'}
          numberOfLines={2}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="bodySm" color="textMuted" style={styles.subtitle}>
            {subtitle}
          </AppText>
        ) : null}
        {footer}
      </View>

      {value ? (
        <AppText variant="bodySm" color="textSecondary" numberOfLines={1} style={styles.value}>
          {value}
        </AppText>
      ) : null}

      {variant === 'navigate' && (
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} aria-hidden />
      )}

      {isSwitch && (
        <Switch
          value={!!switchValue}
          onValueChange={(next) => {
            haptics.selection();
            onSwitchChange?.(next);
          }}
          trackColor={{ true: colors.primary, false: colors.elevated }}
          thumbColor={colors.white}
          ios_backgroundColor={colors.elevated}
          accessibilityLabel={accessibilityLabel ?? title}
          accessibilityHint={accessibilityHint ?? subtitle}
          {...(Platform.OS === 'web' ? ({ activeThumbColor: colors.white } as object) : null)}
        />
      )}
    </>
  );

  if (pressable) {
    return (
      <Pressable
        onPress={() => {
          haptics.selection();
          onPress?.();
        }}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? [title, value, subtitle].filter(Boolean).join(', ')}
        accessibilityHint={accessibilityHint}
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
        {body}
      </Pressable>
    );
  }

  return (
    <View
      style={styles.row}
      accessible={!isSwitch}
      accessibilityLabel={isSwitch ? undefined : [title, subtitle].filter(Boolean).join('. ')}>
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: layout.minTapTarget + 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: GAP,
    paddingHorizontal: layout.gutter,
    paddingVertical: spacing[2.5],
  },
  pressed: { backgroundColor: colors.surfaceAlt },
  tile: {
    width: TILE,
    height: TILE,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  texts: { flex: 1, gap: 2, justifyContent: 'center' },
  subtitle: { lineHeight: 17 },
  value: { maxWidth: '42%', flexShrink: 1 },
});
