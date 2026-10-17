import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useToast, type ToastVariant } from '@/store/useToast';
import { colors, layout, radii, shadows, spacing, zIndex } from '@/theme';

import { AppText } from './AppText';
import { GlassView } from './GlassView';
import type { IoniconName } from './IconButton';

const ICONS: Record<ToastVariant, { name: IoniconName; color: string }> = {
  default: { name: 'information-circle', color: colors.text },
  success: { name: 'checkmark-circle', color: colors.success },
  error: { name: 'alert-circle', color: colors.danger },
  favorite: { name: 'heart', color: colors.primary },
};

/**
 * Global toast host. Mounted once in the root layout. Trigger with
 * `toast.show('Ditambahkan ke Daftarku', { variant: 'favorite' })` from `@/store`.
 */
export function ToastHost() {
  const current = useToast((s) => s.current);
  const hide = useToast((s) => s.hide);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!current) return;
    const t = setTimeout(hide, current.durationMs);
    return () => clearTimeout(t);
  }, [current, hide]);

  const icon = current ? ICONS[current.variant] : null;

  return (
    <View pointerEvents="box-none" style={[styles.host, { top: insets.top + spacing[2] }]}>
      {current && icon && (
        <Animated.View
          key={current.id}
          entering={FadeInUp.springify().damping(18)}
          exiting={FadeOutUp.duration(180)}
          layout={LinearTransition}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          style={[styles.toastWrap, shadows.lg]}>
          <GlassView style={styles.toast} intensity={50} tint="rgba(26,26,33,0.82)">
            <Ionicons
              name={(current.icon as IoniconName | undefined) ?? icon.name}
              size={20}
              color={icon.color}
            />
            <AppText variant="label" numberOfLines={2} style={styles.text}>
              {current.message}
            </AppText>
          </GlassView>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: zIndex.toast,
    elevation: zIndex.toast,
    paddingHorizontal: layout.gutter,
  },
  toastWrap: { borderRadius: radii.pill, maxWidth: 420 },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingVertical: spacing[3],
    paddingLeft: spacing[4],
    paddingRight: spacing[5],
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassBorder,
  },
  text: { flexShrink: 1 },
});
