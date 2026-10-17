import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PosterImage } from '@/components/drama/PosterImage';
import { colors, gradients } from '@/theme';

import { EpisodeInfo } from './EpisodeInfo';
import { playerLayout } from './playerLayout';

export interface EpisodePosterProps {
  poster?: string;
  title: string;
  episode: number;
  total: number;
  synopsis?: string;
  width: number;
  height: number;
  /** Inside a wide-screen stage the safe-area insets don't apply. */
  ignoreInsets?: boolean;
}

/** Lightweight neighbour page: cover + caption, no video. Keeps swipes looking continuous. */
export function EpisodePoster({ poster, title, episode, total, synopsis, width, height, ignoreInsets }: EpisodePosterProps) {
  const insets = useSafeAreaInsets();
  const bottom = ignoreInsets ? 0 : insets.bottom;
  return (
    <View style={[styles.root, { width, height }]}>
      <PosterImage uri={poster} aspectRatio={width / height} radius={0} transition={0} style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, styles.dim]} />
      <View style={styles.center} pointerEvents="none">
        <Ionicons name="play" size={44} color="rgba(255,255,255,0.55)" />
      </View>
      <LinearGradient colors={gradients.videoBottom} style={styles.bottomFade} pointerEvents="none" />
      <EpisodeInfo
        title={title}
        episode={episode}
        total={total}
        synopsis={synopsis}
        style={[
          styles.caption,
          { bottom: playerLayout.captionBottom(bottom), right: playerLayout.railWidth + playerLayout.gutter },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: colors.black, overflow: 'hidden' },
  dim: { backgroundColor: 'rgba(0,0,0,0.35)' },
  center: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  bottomFade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '45%' },
  caption: { position: 'absolute', left: playerLayout.gutter },
});
