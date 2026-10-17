import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { AppText } from '@/components/ui/AppText';
import { IconButton } from '@/components/ui/IconButton';
import { colors, gradients, layout, motion, spacing, zIndex } from '@/theme';

export interface PlayerTopBarProps {
  title: string;
  episode: number;
  total: number;
  visible: boolean;
  topInset: number;
  onClose: () => void;
  onMore: () => void;
}

/** Fixed top chrome over the pager: close, title + "EP 5 / 80", more. */
export function PlayerTopBar({ title, episode, total, visible, topInset, onClose, onMore }: PlayerTopBarProps) {
  const opacity = useSharedValue(visible ? 1 : 0);
  useEffect(() => {
    opacity.set(withTiming(visible ? 1 : 0, { duration: motion.duration.normal }));
  }, [visible, opacity]);
  const style = useAnimatedStyle(() => ({
    opacity: opacity.get(),
    transform: [{ translateY: (1 - opacity.get()) * -8 }],
  }));

  return (
    <Animated.View pointerEvents={visible ? 'box-none' : 'none'} style={[styles.root, style]}>
      <LinearGradient colors={gradients.videoTop} style={styles.fade} pointerEvents="none" />
      <View style={[styles.row, { paddingTop: topInset + spacing[2] }]}>
        <IconButton icon="chevron-down" iconSize={24} accessibilityLabel="Tutup pemutar" onPress={onClose} />
        <View style={styles.center}>
          <AppText variant="title" weight="bold" numberOfLines={1} align="center" style={styles.shadow}>
            {title}
          </AppText>
          <AppText variant="caption" weight="semibold" color="rgba(255,255,255,0.75)" tabular style={styles.shadow}>
            EP {episode}
            {total > 0 ? ` / ${total}` : ''}
          </AppText>
        </View>
        <IconButton icon="ellipsis-horizontal" accessibilityLabel="Pengaturan pemutaran" onPress={onMore} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: zIndex.overlay },
  fade: { position: 'absolute', top: 0, left: 0, right: 0, height: 140 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingHorizontal: layout.gutter - 4,
  },
  center: { flex: 1, alignItems: 'center' },
  shadow: {
    color: colors.white,
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowRadius: 6,
    textShadowOffset: { width: 0, height: 1 },
  },
});
