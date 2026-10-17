import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { FadeIn } from '@/components/ui/FadeIn';
import { GlassView } from '@/components/ui/GlassView';
import type { IoniconName } from '@/components/ui/IconButton';
import { colors, radii, spacing, zIndex } from '@/theme';

export interface PlayerNotice {
  id: number;
  message: string;
  icon?: IoniconName;
  iconColor?: string;
}

export interface PlayerToastProps {
  notice: PlayerNotice | null;
  onHide: () => void;
  top: number;
}

/**
 * In-player toast. The global ToastHost renders under the native fullScreenModal on iOS,
 * so the player shows its own confirmation pill.
 */
export function PlayerToast({ notice, onHide, top }: PlayerToastProps) {
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(onHide, 1800);
    return () => clearTimeout(t);
  }, [notice, onHide]);

  if (!notice) return null;

  return (
    <View pointerEvents="none" accessibilityLiveRegion="polite" style={[styles.host, { top }]}>
      <FadeIn key={notice.id} duration={200}>
        <GlassView style={styles.pill} intensity={40} tint="rgba(20,20,26,0.78)">
          {notice.icon && <Ionicons name={notice.icon} size={16} color={notice.iconColor ?? colors.white} />}
          <AppText variant="label" numberOfLines={1}>
            {notice.message}
          </AppText>
        </GlassView>
      </FadeIn>
    </View>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: zIndex.overlay },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[4],
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassBorder,
  },
});
