import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { AppText } from '@/components/ui/AppText';
import { GlassView } from '@/components/ui/GlassView';
import { PressableScale } from '@/components/ui/PressableScale';
import { colors, layout, motion, radii, shadows, spacing } from '@/theme';

/** Height of the bar itself; lists add this to their bottom padding while it is visible. */
export const EDIT_BAR_HEIGHT = 64;

export interface EditActionBarProps {
  visible: boolean;
  selectedCount: number;
  totalCount: number;
  /** Distance from the screen bottom (sits just above the floating tab bar). */
  bottom: number;
  onToggleAll: () => void;
  onDelete: () => void;
}

/** Floating selection toolbar: "{n} dipilih", select-all toggle and a destructive "Hapus". */
export function EditActionBar({ visible, selectedCount, totalCount, bottom, onToggleAll, onDelete }: EditActionBarProps) {
  const shown = useSharedValue(visible ? 1 : 0);

  useEffect(() => {
    shown.set(
      visible
        ? withSpring(1, motion.spring.sheet)
        : withTiming(0, { duration: motion.duration.fast, easing: motion.easing.accelerate }),
    );
  }, [shown, visible]);

  const animatedStyle = useAnimatedStyle(() => {
    const p = shown.get();
    return { opacity: Math.min(1, p * 1.5), transform: [{ translateY: (1 - p) * (EDIT_BAR_HEIGHT + 48) }] };
  });

  const allSelected = totalCount > 0 && selectedCount === totalCount;
  const none = selectedCount === 0;

  return (
    <Animated.View
      aria-hidden={!visible}
      style={[styles.wrap, { bottom, pointerEvents: visible ? 'box-none' : 'none' }, animatedStyle]}>
      <GlassView intensity={50} tint="rgba(20,20,26,0.88)" style={styles.bar}>
        <View style={styles.info}>
          <AppText variant="bodyMedium" weight="bold" numberOfLines={1} accessibilityLiveRegion="polite">
            {`${selectedCount} dipilih`}
          </AppText>
        </View>

        <PressableScale
          onPress={onToggleAll}
          haptic="selection"
          activeScale={0.95}
          accessibilityLabel={allSelected ? 'Batalkan pilihan semua' : 'Pilih semua'}
          hitSlop={4}
          style={styles.textBtn}>
          <AppText variant="label" color="textSecondary" numberOfLines={1}>
            {allSelected ? 'Kosongkan' : 'Pilih semua'}
          </AppText>
        </PressableScale>

        <PressableScale
          onPress={onDelete}
          disabled={none}
          haptic="medium"
          activeScale={0.95}
          accessibilityLabel={none ? 'Hapus dari Favorit' : `Hapus ${selectedCount} drama dari Favorit`}
          style={[styles.delete, none && styles.deleteOff]}>
          <Ionicons name="trash-outline" size={17} color={none ? colors.textMuted : colors.white} />
          <AppText variant="label" weight="bold" color={none ? 'textMuted' : 'white'}>
            Hapus
          </AppText>
        </PressableScale>
      </GlassView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: layout.gutter,
  },
  bar: {
    width: '100%',
    maxWidth: layout.maxContentWidth,
    height: EDIT_BAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingLeft: spacing[5],
    paddingRight: spacing[2],
    borderRadius: radii.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassBorder,
    overflow: 'hidden',
    ...shadows.lg,
  },
  info: { flex: 1, minWidth: 0 },
  textBtn: {
    minHeight: layout.minTapTarget,
    paddingHorizontal: spacing[2],
    justifyContent: 'center',
  },
  delete: {
    height: 48,
    paddingHorizontal: spacing[5],
    borderRadius: radii.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[1.5],
    backgroundColor: colors.danger,
  },
  deleteOff: { backgroundColor: colors.elevated },
});
