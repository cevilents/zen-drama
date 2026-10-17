import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import type { IoniconName } from '@/components/ui/IconButton';
import { PressableScale } from '@/components/ui/PressableScale';
import { colors, layout, spacing } from '@/theme';

export interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  /** Leading glyph (e.g. "flame" for trending), drawn in primary. */
  icon?: IoniconName;
  iconColor?: string;
  /** Shows "Lihat semua ›" when provided. */
  onSeeAll?: () => void;
  seeAllLabel?: string;
  /** Custom right element (overrides see-all). */
  right?: ReactNode;
  /** Horizontal padding. Default layout.gutter. */
  inset?: number;
  style?: StyleProp<ViewStyle>;
}

export function SectionHeader({
  title,
  subtitle,
  icon,
  iconColor = colors.primary,
  onSeeAll,
  seeAllLabel = 'Lihat semua',
  right,
  inset = layout.gutter,
  style,
}: SectionHeaderProps) {
  return (
    <View style={[styles.row, { paddingHorizontal: inset }, style]}>
      <View style={styles.titleWrap}>
        <View style={styles.titleRow}>
          {icon && <Ionicons name={icon} size={18} color={iconColor} />}
          <AppText variant="h3" numberOfLines={1} accessibilityRole="header" style={styles.title}>
            {title}
          </AppText>
        </View>
        {subtitle && (
          <AppText variant="caption" color="textMuted" numberOfLines={1} style={styles.subtitle}>
            {subtitle}
          </AppText>
        )}
      </View>
      {right ??
        (onSeeAll && (
          <PressableScale
            onPress={onSeeAll}
            haptic="selection"
            accessibilityLabel={`${seeAllLabel} ${title}`}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 8 }}
            style={styles.seeAll}>
            <AppText variant="label" color="textSecondary">
              {seeAllLabel}
            </AppText>
            <Ionicons name="chevron-forward" size={14} color={colors.textSecondary} />
          </PressableScale>
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing[3] },
  titleWrap: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[1.5] },
  title: { flexShrink: 1 },
  subtitle: { marginTop: 2 },
  seeAll: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: spacing[1] },
});
