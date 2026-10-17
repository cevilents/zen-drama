import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import type { IoniconName } from '@/components/ui/IconButton';
import { PressableScale } from '@/components/ui/PressableScale';
import { colors, spacing } from '@/theme';

export interface SearchSectionTitleProps {
  title: string;
  icon?: IoniconName;
  iconColor?: string;
  action?: { label: string; onPress: () => void };
}

/** Compact section heading used on the idle search screen. */
export function SearchSectionTitle({ title, icon, iconColor = colors.textSecondary, action }: SearchSectionTitleProps) {
  return (
    <View style={styles.row}>
      <View style={styles.left}>
        {icon && <Ionicons name={icon} size={16} color={iconColor} />}
        <AppText variant="title" weight="bold" accessibilityRole="header">
          {title}
        </AppText>
      </View>
      {action && (
        <PressableScale onPress={action.onPress} hitSlop={12} accessibilityLabel={action.label}>
          <AppText variant="label" color="primary">
            {action.label}
          </AppText>
        </PressableScale>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing[3],
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: spacing[1.5] },
});
