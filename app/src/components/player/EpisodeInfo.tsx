import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { gradients, radii, spacing } from '@/theme';

export interface EpisodeInfoProps {
  title: string;
  episode: number;
  total: number;
  synopsis?: string;
  style?: StyleProp<ViewStyle>;
  onLayout?: ViewProps['onLayout'];
}

const shadow = {
  textShadowColor: 'rgba(0,0,0,0.6)',
  textShadowRadius: 8,
  textShadowOffset: { width: 0, height: 1 },
};

/** Bottom-left caption block: EP pill, drama title, one-line synopsis. */
export function EpisodeInfo({ title, episode, total, synopsis, style, onLayout }: EpisodeInfoProps) {
  return (
    <View style={[styles.root, style]} onLayout={onLayout}>
      <View style={styles.row}>
        <LinearGradient colors={gradients.primary} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.pill}>
          <AppText variant="caption" weight="extrabold" tabular style={styles.pillText}>
            EP {episode}
          </AppText>
        </LinearGradient>
        {total > 0 && (
          <AppText variant="caption" weight="semibold" color="rgba(255,255,255,0.78)" tabular style={shadow}>
            dari {total} episode
          </AppText>
        )}
      </View>
      <AppText variant="h3" numberOfLines={2} style={[styles.title, shadow]}>
        {title}
      </AppText>
      {!!synopsis && (
        <AppText variant="bodySm" color="rgba(255,255,255,0.78)" numberOfLines={1} style={shadow}>
          {synopsis}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing[1.5] },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  pill: { borderRadius: radii.xs, paddingHorizontal: spacing[2], height: 20, justifyContent: 'center' },
  pillText: { fontSize: 11, lineHeight: 13, letterSpacing: 0.4 },
  title: { fontSize: 17, lineHeight: 22 },
});
