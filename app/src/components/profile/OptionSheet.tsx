import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { haptics } from '@/lib/haptics';
import { colors, layout, radii, spacing } from '@/theme';

export interface Option<T extends string | number> {
  value: T;
  label: string;
  /** Muted trailing hint, e.g. "Disarankan". */
  hint?: string;
}

export interface OptionSheetProps<T extends string | number> {
  visible: boolean;
  onClose: () => void;
  title: string;
  options: readonly Option<T>[];
  selected: T;
  onSelect: (value: T) => void;
}

/** Single-choice list inside a BottomSheet, checkmark on the selected row. Closes on pick. */
export function OptionSheet<T extends string | number>({
  visible,
  onClose,
  title,
  options,
  selected,
  onSelect,
}: OptionSheetProps<T>) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title={title}>
      <View style={styles.list} accessibilityRole="radiogroup">
        {options.map((opt) => {
          const active = opt.value === selected;
          return (
            <Pressable
              key={String(opt.value)}
              accessibilityRole="radio"
              accessibilityState={{ checked: active }}
              accessibilityLabel={opt.label}
              onPress={() => {
                haptics.selection();
                onSelect(opt.value);
                onClose();
              }}
              style={({ pressed }) => [styles.row, active && styles.rowActive, pressed && styles.rowPressed]}>
              <AppText variant="title" color={active ? 'text' : 'textSecondary'} style={styles.label}>
                {opt.label}
              </AppText>
              {opt.hint ? (
                <AppText variant="bodySm" color="textMuted">
                  {opt.hint}
                </AppText>
              ) : null}
              <View style={styles.check} aria-hidden>
                {active && <Ionicons name="checkmark-circle" size={22} color={colors.primary} />}
              </View>
            </Pressable>
          );
        })}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing[1], paddingBottom: spacing[2] },
  row: {
    minHeight: layout.minTapTarget + 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[4],
    borderRadius: radii.md,
  },
  rowActive: { backgroundColor: colors.primarySoft },
  rowPressed: { backgroundColor: colors.surfaceAlt },
  label: { flex: 1 },
  check: { width: 22, height: 22 },
});
