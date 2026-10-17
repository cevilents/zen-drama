import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { flattenPages, useList } from '@/api/hooks';
import type { Drama } from '@/api/types';
import { DramaCard } from '@/components/drama/DramaCard';
import { AppText } from '@/components/ui/AppText';
import { FadeIn } from '@/components/ui/FadeIn';
import { GradientButton } from '@/components/ui/GradientButton';
import { Skeleton } from '@/components/ui/Skeleton';
import { dramaHref } from '@/lib/routes';
import { colors, gradients, radii, spacing } from '@/theme';

export interface EndCardProps {
  drama: Pick<Drama, 'source' | 'id' | 'title' | 'totalEpisodes' | 'lang'>;
  /** Stage width, used to size the three picks. */
  width: number;
  onReplay: () => void;
  onClose: () => void;
}

/** Final-episode end screen: congrats, three picks from the same source, replay / back. */
export function EndCard({ drama, width, onReplay, onClose }: EndCardProps) {
  // Picks from the drama's own catalog, whatever the app's content language.
  const list = useList(drama.source, 'foryou', drama.lang ?? 'id');
  const picks = flattenPages(list.data)
    .filter((d) => d.id !== drama.id)
    .slice(0, 3);
  const cardW = Math.floor((Math.min(width, 420) - spacing[6] * 2 - spacing[3] * 2) / 3);

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['rgba(255,45,85,0.22)', 'rgba(0,0,0,0.0)']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.6 }}
        style={StyleSheet.absoluteFill}
      />
      <FadeIn style={styles.content}>
        <LinearGradient colors={gradients.gold} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.badge}>
          <Ionicons name="trophy" size={26} color={colors.textInverse} />
        </LinearGradient>
        <AppText variant="h2" align="center" style={styles.title}>
          Kamu sudah menonton semua episode
        </AppText>
        <AppText variant="bodySm" color="textSecondary" align="center" numberOfLines={2} style={styles.sub}>
          {drama.totalEpisodes} episode “{drama.title}” tuntas. Lanjut ke drama berikutnya?
        </AppText>

        <AppText variant="label" color="textSecondary" style={styles.pickLabel}>
          Mungkin kamu suka
        </AppText>
        <View style={styles.picks}>
          {list.isPending
            ? [0, 1, 2].map((i) => (
                <View key={i} style={{ width: cardW }}>
                  <Skeleton aspectRatio={3 / 4} radius={radii.md} />
                  <Skeleton height={10} width="80%" radius={radii.xs} style={styles.skelLine} />
                </View>
              ))
            : picks.map((d) => (
                <DramaCard
                  key={`${d.source}:${d.id}`}
                  drama={d}
                  width={cardW}
                  titleLines={2}
                  onPress={(x) => router.replace(dramaHref(x))}
                />
              ))}
        </View>

        <View style={styles.actions}>
          <GradientButton label="Kembali" icon="chevron-back" onPress={onClose} fullWidth />
          <GradientButton label="Tonton ulang EP terakhir" icon="refresh" variant="secondary" onPress={onReplay} fullWidth />
        </View>
      </FadeIn>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(7,7,10,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[6],
  },
  content: { width: '100%', maxWidth: 420, alignItems: 'center' },
  badge: {
    width: 60,
    height: 60,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[4],
  },
  title: { maxWidth: 300 },
  sub: { marginTop: spacing[2], maxWidth: 320 },
  pickLabel: { alignSelf: 'flex-start', marginTop: spacing[8], marginBottom: spacing[3] },
  picks: { flexDirection: 'row', gap: spacing[3], alignSelf: 'stretch', minHeight: 40 },
  skelLine: { marginTop: spacing[2] },
  actions: { alignSelf: 'stretch', gap: spacing[3], marginTop: spacing[8] },
});
