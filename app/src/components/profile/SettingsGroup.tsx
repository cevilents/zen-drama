import { Children, Fragment, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { colors, layout, radii, spacing } from '@/theme';

import { ROW_INSET } from './SettingsRow';

export interface SettingsGroupProps {
  /** Small uppercase header above the card. */
  title?: string;
  /** Footnote under the card. */
  footer?: string;
  children?: ReactNode;
}

/** iOS inset-grouped card: overline header, rounded surface, hairline separators between rows. */
export function SettingsGroup({ title, footer, children }: SettingsGroupProps) {
  const rows = Children.toArray(children);
  return (
    <View style={styles.wrap}>
      {title ? (
        <AppText variant="overline" color="textMuted" style={styles.title} accessibilityRole="header">
          {title}
        </AppText>
      ) : null}
      <View style={styles.card}>
        {rows.map((row, i) => (
          <Fragment key={i}>
            {i > 0 && <View aria-hidden style={styles.separator} />}
            {row}
          </Fragment>
        ))}
      </View>
      {footer ? (
        <AppText variant="caption" color="textMuted" style={styles.footer}>
          {footer}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing[2] },
  title: { paddingHorizontal: spacing[1] },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginLeft: layout.gutter + ROW_INSET,
  },
  footer: { paddingHorizontal: spacing[1] },
});
