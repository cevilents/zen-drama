import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import type { Drama } from '@/api/types';
import { DramaCard } from '@/components/drama/DramaCard';
import { colors, gradients, motion, radii, spacing } from '@/theme';

export interface FavoriteGridItemProps {
  drama: Drama;
  /** Column width in points. */
  width: number;
  editing: boolean;
  selected: boolean;
  /** Normal mode: open detail (omit to use DramaCard's default navigation). */
  onOpen?: (drama: Drama) => void;
  /** Edit mode: toggle selection. */
  onToggle: (drama: Drama) => void;
  /** Normal mode: long-press enters edit mode with this item selected. */
  onEnterEdit: (drama: Drama) => void;
}

const CHECK = 24;
const FILL = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const;

/**
 * Selection layer drawn over the poster. Purely visual (`pointerEvents: none`) so taps always
 * reach the DramaCard underneath; nesting a pressable here would break on web.
 */
function SelectionOverlay({ editing, selected }: { editing: boolean; selected: boolean }) {
  const show = useSharedValue(editing ? 1 : 0);
  const pick = useSharedValue(selected ? 1 : 0);

  useEffect(() => {
    show.set(withTiming(editing ? 1 : 0, { duration: motion.duration.fast, easing: motion.easing.standard }));
  }, [show, editing]);

  useEffect(() => {
    pick.set(withSpring(selected ? 1 : 0, motion.spring.press));
  }, [pick, selected]);

  const rootStyle = useAnimatedStyle(() => ({ opacity: show.get() }));
  const ringStyle = useAnimatedStyle(() => ({ opacity: pick.get() }));
  const fillStyle = useAnimatedStyle(() => {
    const p = pick.get();
    return { opacity: Math.min(1, p), transform: [{ scale: 0.4 + 0.6 * p }] };
  });

  return (
    <Animated.View style={[styles.overlay, rootStyle]}>
      <Animated.View style={[styles.dim, ringStyle]} />
      <Animated.View style={[styles.ring, ringStyle]} />
      <View style={styles.checkSlot}>
        <View style={styles.checkEmpty} />
        <Animated.View style={[styles.checkFilled, fillStyle]}>
          <LinearGradient
            colors={gradients.primary}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.checkGradient}>
            <Ionicons name="checkmark" size={16} color={colors.white} />
          </LinearGradient>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

/** Poster-grid cell: a DramaCard plus an edit-mode selection overlay. */
export function FavoriteGridItem({ drama, width, editing, selected, onOpen, onToggle, onEnterEdit }: FavoriteGridItemProps) {
  return (
    <View style={{ width }}>
      <DramaCard
        drama={drama}
        width={width}
        titleLines={2}
        onPress={editing ? onToggle : onOpen}
        onLongPress={editing ? undefined : onEnterEdit}
      />
      <SelectionOverlay editing={editing} selected={selected} />
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    aspectRatio: 3 / 4,
    borderRadius: radii.md,
    pointerEvents: 'none',
  },
  dim: {
    ...FILL,
    borderRadius: radii.md,
    backgroundColor: 'rgba(7,7,10,0.28)',
  },
  ring: {
    ...FILL,
    borderRadius: radii.md,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  checkSlot: { position: 'absolute', top: spacing[2], right: spacing[2], width: CHECK, height: CHECK },
  checkEmpty: {
    ...FILL,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.85)',
    backgroundColor: 'rgba(7,7,10,0.4)',
  },
  checkFilled: { ...FILL, borderRadius: radii.pill, overflow: 'hidden' },
  checkGradient: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
