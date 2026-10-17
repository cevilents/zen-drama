import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { GlassView } from '@/components/ui/GlassView';
import { IconButton } from '@/components/ui/IconButton';
import { PressableScale } from '@/components/ui/PressableScale';
import { formatDuration, progressRatio } from '@/lib/format';
import { watchHref } from '@/lib/routes';
import type { HistoryEntry } from '@/store/useHistory';
import { colors, gradients, radii, spacing } from '@/theme';

import { PosterImage } from './PosterImage';
import { ProgressBar } from './ProgressBar';

export interface ContinueCardProps {
  entry: HistoryEntry;
  /** Card width. Default 128. */
  width?: number;
  /** Default: open the player at `entry.lastEpisode`. */
  onPress?: (entry: HistoryEntry) => void;
  /** Shows a small × button to drop the entry from history. */
  onRemove?: (entry: HistoryEntry) => void;
  style?: StyleProp<ViewStyle>;
}

/** "Lanjut nonton" card: poster + play glyph + progress + "EP 5 · 12:30". */
export function ContinueCard({ entry, width = 128, onPress, onRemove, style }: ContinueCardProps) {
  const { drama, lastEpisode, positionSec, durationSec } = entry;
  const ratio = progressRatio(positionSec, durationSec);

  // The remove button is a sibling of (not nested in) the card pressable: nested <button>s are invalid on web.
  return (
    <View style={[{ width }, style]}>
      <PressableScale
        onPress={() =>
          onPress ? onPress(entry) : router.push(watchHref(drama.source, drama.id, lastEpisode))
        }
        accessibilityLabel={`Lanjutkan ${drama.title}, episode ${lastEpisode}`}>
        <PosterImage uri={drama.cover} accessibilityLabel={drama.title} radius={radii.md}>
          <LinearGradient
            colors={gradients.posterBottom}
            locations={[0.45, 0.7, 1]}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.center} pointerEvents="none">
            <GlassView style={styles.play} intensity={30}>
              <Ionicons name="play" size={20} color={colors.white} style={styles.playGlyph} />
            </GlassView>
          </View>
          <View style={styles.bottom}>
            <AppText variant="caption" weight="bold" tabular>
              EP {lastEpisode}
              <AppText variant="caption" color="textSecondary" tabular>
                {positionSec > 0 ? `  ·  ${formatDuration(positionSec)}` : ''}
              </AppText>
            </AppText>
            <ProgressBar progress={ratio} />
          </View>
        </PosterImage>
        <AppText variant="label" numberOfLines={1} style={styles.title}>
          {drama.title}
        </AppText>
      </PressableScale>
      {onRemove && (
        <IconButton
          icon="close"
          size={26}
          iconSize={14}
          accessibilityLabel={`Hapus ${drama.title} dari riwayat`}
          onPress={() => onRemove(entry)}
          style={styles.remove}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  play: {
    width: 44,
    height: 44,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassBorder,
  },
  playGlyph: { marginLeft: 3 },
  bottom: {
    position: 'absolute',
    left: spacing[2],
    right: spacing[2],
    bottom: spacing[2],
    gap: spacing[1.5],
  },
  remove: { position: 'absolute', top: spacing[1.5], right: spacing[1.5] },
  title: { marginTop: spacing[2] },
});
