import { Ionicons } from '@expo/vector-icons';
import { Platform, StyleSheet, View } from 'react-native';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { PosterImage } from '@/components/drama/PosterImage';
import { ProgressBar } from '@/components/drama/ProgressBar';
import { AppText } from '@/components/ui/AppText';
import { Badge } from '@/components/ui/Badge';
import { IconButton } from '@/components/ui/IconButton';
import { PressableScale } from '@/components/ui/PressableScale';
import { formatDuration, progressRatio } from '@/lib/format';
import type { HistoryEntry } from '@/store';
import { colors, layout, radii, spacing } from '@/theme';

import { formatWatchedAt } from './groupHistory';

export interface HistoryRowProps {
  entry: HistoryEntry;
  /** Resume playback at `entry.lastEpisode`. */
  onOpen: (entry: HistoryEntry) => void;
  onRemove: (entry: HistoryEntry) => void;
}

const POSTER_WIDTH = 88;
const ACTION_WIDTH = 88;

function SwipeAction({ progress, onPress }: { progress: SharedValue<number>; onPress: () => void }) {
  const animated = useAnimatedStyle(() => ({ opacity: Math.min(1, progress.get() * 1.5) }));
  return (
    <Animated.View style={[styles.actionWrap, animated]}>
      <PressableScale
        onPress={onPress}
        haptic="medium"
        activeScale={0.94}
        accessibilityLabel="Hapus dari riwayat"
        style={styles.action}>
        <Ionicons name="trash-outline" size={20} color={colors.white} />
        <AppText variant="caption" weight="bold" color="white">
          Hapus
        </AppText>
      </PressableScale>
    </Animated.View>
  );
}

/**
 * Watch-history row. Poster + text open the player; the remove button is a *sibling* of the
 * pressable (never nested, which web forbids). On native the row also swipes left to reveal "Hapus".
 */
export function HistoryRow({ entry, onOpen, onRemove }: HistoryRowProps) {
  const { drama, lastEpisode, positionSec, durationSec, updatedAt } = entry;
  const subtitle = `Lanjut EP ${lastEpisode}${positionSec > 0 ? ` · ${formatDuration(positionSec)}` : ''}`;

  const row = (
    <View style={styles.row}>
      <PressableScale
        activeScale={0.98}
        onPress={() => onOpen(entry)}
        accessibilityLabel={`${drama.title}. ${subtitle}`}
        accessibilityHint="Lanjutkan menonton"
        style={styles.main}>
        <PosterImage uri={drama.cover} style={{ width: POSTER_WIDTH }} radius={radii.md} accessibilityLabel={drama.title}>
          {drama.isCompleted && <Badge variant="completed" style={styles.badge} />}
          <View style={styles.progress}>
            <ProgressBar progress={progressRatio(positionSec, durationSec)} />
          </View>
        </PosterImage>

        <View style={styles.body}>
          <AppText variant="title" numberOfLines={2}>
            {drama.title}
          </AppText>
          <AppText variant="caption" color="primary" numberOfLines={1} style={styles.sub}>
            {subtitle}
          </AppText>
          <View style={styles.meta}>
            <View style={styles.metaItem}>
              <Ionicons name="time-outline" size={12} color={colors.textMuted} />
              <AppText variant="caption" color="textMuted" numberOfLines={1}>
                {formatWatchedAt(updatedAt)}
              </AppText>
            </View>
            {drama.totalEpisodes > 0 && (
              <View style={styles.metaItem}>
                <Ionicons name="albums-outline" size={12} color={colors.textMuted} />
                <AppText variant="caption" color="textMuted">
                  {drama.totalEpisodes} EP
                </AppText>
              </View>
            )}
          </View>
        </View>
      </PressableScale>

      <IconButton
        icon="close"
        variant="ghost"
        size={36}
        iconSize={18}
        color={colors.textMuted}
        accessibilityLabel={`Hapus ${drama.title} dari riwayat`}
        onPress={() => onRemove(entry)}
      />
    </View>
  );

  if (Platform.OS === 'web') return row;

  return (
    <ReanimatedSwipeable
      overshootRight={false}
      friction={1.6}
      rightThreshold={ACTION_WIDTH * 0.5}
      renderRightActions={(progress: SharedValue<number>, _translation: SharedValue<number>, methods: SwipeableMethods) => (
        <SwipeAction
          progress={progress}
          onPress={() => {
            methods.close();
            onRemove(entry);
          }}
        />
      )}>
      {row}
    </ReanimatedSwipeable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    paddingHorizontal: layout.gutter,
    backgroundColor: colors.bg,
  },
  main: { flex: 1, flexDirection: 'row', gap: spacing[3], alignItems: 'center', minWidth: 0 },
  badge: { position: 'absolute', top: spacing[1.5], left: spacing[1.5] },
  progress: { position: 'absolute', left: spacing[1.5], right: spacing[1.5], bottom: spacing[1.5] },
  body: { flex: 1, minWidth: 0, minHeight: layout.minTapTarget },
  sub: { marginTop: spacing[1.5] },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: spacing[3], rowGap: spacing[1], marginTop: spacing[2] },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: spacing[1] },
  actionWrap: { width: ACTION_WIDTH + layout.gutter, paddingRight: layout.gutter, paddingLeft: spacing[2] },
  action: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[1],
    borderRadius: radii.md,
    backgroundColor: colors.danger,
  },
});
