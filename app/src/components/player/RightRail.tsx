import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring } from 'react-native-reanimated';

import { AppText } from '@/components/ui/AppText';
import type { IoniconName } from '@/components/ui/IconButton';
import { PressableScale } from '@/components/ui/PressableScale';
import { colors, radii, spacing } from '@/theme';

export interface RightRailProps {
  favorite: boolean;
  onToggleFavorite: () => void;
  onOpenEpisodes: () => void;
  onShare: () => void;
  onOpenSpeed: () => void;
  rate: number;
  style?: StyleProp<ViewStyle>;
}

function RailButton({
  label,
  accessibilityLabel,
  onPress,
  children,
  selected,
}: {
  label: string;
  accessibilityLabel: string;
  onPress: () => void;
  children: ReactNode;
  selected?: boolean;
}) {
  return (
    <PressableScale
      onPress={onPress}
      haptic="light"
      activeScale={0.86}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={selected != null ? { selected } : undefined}
      hitSlop={6}
      style={styles.item}>
      <View style={styles.glyph}>{children}</View>
      <AppText variant="caption" weight="semibold" style={styles.label} numberOfLines={1}>
        {label}
      </AppText>
    </PressableScale>
  );
}

function RailIcon({ name, color = colors.white, size = 30 }: { name: IoniconName; color?: string; size?: number }) {
  return <Ionicons name={name} size={size} color={color} style={styles.iconShadow} />;
}

function formatRate(rate: number): string {
  return `${String(rate).replace('.', ',')}x`;
}

/** TikTok-style vertical action rail (favorite, episodes, share, speed). */
export function RightRail({ favorite, onToggleFavorite, onOpenEpisodes, onShare, onOpenSpeed, rate, style }: RightRailProps) {
  const pop = useSharedValue(1);
  const prevFavorite = useRef(favorite);

  useEffect(() => {
    if (prevFavorite.current === favorite) return;
    prevFavorite.current = favorite;
    if (favorite) {
      pop.set(withSequence(withSpring(1.38, { damping: 6, stiffness: 420 }), withSpring(1, { damping: 10, stiffness: 260 })));
    } else {
      pop.set(withSequence(withSpring(0.8, { damping: 12, stiffness: 420 }), withSpring(1, { damping: 12, stiffness: 260 })));
    }
  }, [favorite, pop]);

  const heartStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.get() }] }));

  return (
    <View style={[styles.rail, style]}>
      <RailButton
        label={favorite ? 'Tersimpan' : 'Daftarku'}
        accessibilityLabel={favorite ? 'Hapus dari Daftarku' : 'Tambah ke Daftarku'}
        selected={favorite}
        onPress={onToggleFavorite}>
        <Animated.View style={heartStyle}>
          <RailIcon name={favorite ? 'heart' : 'heart-outline'} color={favorite ? colors.primary : colors.white} size={32} />
        </Animated.View>
      </RailButton>
      <RailButton label="Episode" accessibilityLabel="Daftar episode" onPress={onOpenEpisodes}>
        <RailIcon name="albums" size={28} />
      </RailButton>
      <RailButton label="Bagikan" accessibilityLabel="Bagikan drama" onPress={onShare}>
        <RailIcon name="arrow-redo" size={29} />
      </RailButton>
      <RailButton label="Kecepatan" accessibilityLabel={`Kecepatan putar ${formatRate(rate)}`} onPress={onOpenSpeed}>
        <View style={[styles.rateBadge, rate !== 1 && styles.rateBadgeActive]}>
          <AppText variant="caption" weight="extrabold" tabular style={styles.rateText}>
            {formatRate(rate)}
          </AppText>
        </View>
      </RailButton>
    </View>
  );
}

const shadow = {
  textShadowColor: 'rgba(0,0,0,0.55)',
  textShadowRadius: 8,
  textShadowOffset: { width: 0, height: 1 },
};

const styles = StyleSheet.create({
  rail: { alignItems: 'center', gap: spacing[4] },
  item: { alignItems: 'center', minWidth: 56 },
  glyph: { height: 36, alignItems: 'center', justifyContent: 'center' },
  iconShadow: shadow,
  label: { marginTop: 2, fontSize: 11, ...shadow },
  rateBadge: {
    minWidth: 34,
    height: 26,
    paddingHorizontal: 6,
    borderRadius: radii.sm,
    borderWidth: 1.5,
    borderColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  rateBadgeActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  rateText: { fontSize: 11, lineHeight: 13 },
});
