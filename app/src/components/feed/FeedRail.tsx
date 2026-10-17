import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import type { Drama } from '@/api/types';
import { AppText } from '@/components/ui/AppText';
import type { IoniconName } from '@/components/ui/IconButton';
import { PressableScale } from '@/components/ui/PressableScale';
import { colors, layout, motion, spacing } from '@/theme';

import { onVideo, videoTextShadow } from './overlay';

export interface FeedRailProps {
  drama: Drama;
  isFavorite: boolean;
  muted: boolean;
  onToggleFavorite: () => void;
  onOpenDetail: () => void;
  onShare: () => void;
  onToggleMute: () => void;
}

interface RailButtonProps {
  icon: IoniconName;
  label: string;
  accessibilityLabel: string;
  onPress: () => void;
  color?: string;
  selected?: boolean;
  /** Drives a scale pop on the glyph (heart). */
  scale?: SharedValue<number>;
}

function RailButton({ icon, label, accessibilityLabel, onPress, color, selected, scale }: RailButtonProps) {
  const glyphStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale ? scale.get() : 1 }] }));
  return (
    <PressableScale
      onPress={onPress}
      haptic="light"
      activeScale={0.86}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected }}
      style={styles.button}>
      <Animated.View style={glyphStyle}>
        <Ionicons name={icon} size={31} color={color ?? onVideo.text} style={videoTextShadow} />
      </Animated.View>
      <AppText variant="caption" weight="semibold" color={onVideo.text} numberOfLines={1} style={[styles.label, videoTextShadow]}>
        {label}
      </AppText>
    </PressableScale>
  );
}

/** TikTok-style action column: favorite, episodes/detail, share, sound. */
export function FeedRail({
  drama,
  isFavorite,
  muted,
  onToggleFavorite,
  onOpenDetail,
  onShare,
  onToggleMute,
}: FeedRailProps) {
  const heart = useSharedValue(1);
  const wasFavorite = useRef(isFavorite);

  // Pop whenever the drama becomes a favorite — from the rail or from a double-tap on the video.
  useEffect(() => {
    if (isFavorite && !wasFavorite.current) {
      heart.set(
        withSequence(
          withTiming(0.7, { duration: motion.duration.instant }),
          withSpring(1.28, motion.spring.press),
          withSpring(1, motion.spring.gentle),
        ),
      );
    }
    wasFavorite.current = isFavorite;
  }, [isFavorite, heart]);

  return (
    <View style={styles.rail}>
      <RailButton
        icon={isFavorite ? 'heart' : 'heart-outline'}
        color={isFavorite ? colors.primary : undefined}
        label={isFavorite ? 'Tersimpan' : 'Simpan'}
        selected={isFavorite}
        accessibilityLabel={isFavorite ? `Hapus ${drama.title} dari Daftarku` : `Simpan ${drama.title} ke Daftarku`}
        onPress={onToggleFavorite}
        scale={heart}
      />
      <RailButton
        icon="albums-outline"
        label={drama.totalEpisodes > 0 ? `${drama.totalEpisodes} EP` : 'Episode'}
        accessibilityLabel={`Lihat detail dan daftar episode ${drama.title}`}
        onPress={onOpenDetail}
      />
      <RailButton icon="arrow-redo-outline" label="Bagikan" accessibilityLabel={`Bagikan ${drama.title}`} onPress={onShare} />
      <RailButton
        icon={muted ? 'volume-mute-outline' : 'volume-high-outline'}
        label={muted ? 'Bisu' : 'Suara'}
        selected={!muted}
        accessibilityLabel={muted ? 'Nyalakan suara' : 'Matikan suara'}
        onPress={onToggleMute}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  rail: { alignItems: 'center', gap: spacing[4] },
  button: {
    minWidth: layout.minTapTarget + 8,
    minHeight: layout.minTapTarget,
    alignItems: 'center',
    gap: 2,
  },
  label: { fontSize: 11.5, lineHeight: 14 },
});
