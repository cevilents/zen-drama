import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { ErrorState } from '@/components/states/ErrorState';
import { AppText } from '@/components/ui/AppText';
import { FadeIn } from '@/components/ui/FadeIn';
import { GradientButton } from '@/components/ui/GradientButton';
import { colors, radii, spacing } from '@/theme';

function Scrim({ children }: { children: ReactNode }) {
  return (
    <View style={styles.scrim}>
      <FadeIn style={styles.content}>{children}</FadeIn>
    </View>
  );
}

export interface LockedCardProps {
  episode: number;
  onNext?: () => void;
  onOpenEpisodes: () => void;
}

/** Shown when the source marks the episode as locked / without a playable stream. */
export function LockedCard({ episode, onNext, onOpenEpisodes }: LockedCardProps) {
  return (
    <Scrim>
      <LinearGradient
        colors={['rgba(245,184,65,0.32)', 'rgba(224,155,45,0.04)']}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={styles.halo}>
        <View style={styles.haloInner}>
          <Ionicons name="lock-closed" size={30} color={colors.gold} />
        </View>
      </LinearGradient>
      <AppText variant="overline" color="gold" align="center">
        EP {episode} terkunci
      </AppText>
      <AppText variant="h2" align="center" style={styles.title}>
        Episode ini belum bisa diputar
      </AppText>
      <AppText variant="bodySm" color="textSecondary" align="center" style={styles.message}>
        Sumber drama mengunci episode ini. Coba lanjut ke episode berikutnya atau pilih episode lain.
      </AppText>
      <View style={styles.actions}>
        {onNext && <GradientButton label="Episode berikutnya" icon="play-skip-forward" onPress={onNext} fullWidth />}
        <GradientButton
          label="Pilih episode"
          icon="albums-outline"
          variant="secondary"
          onPress={onOpenEpisodes}
          fullWidth
        />
      </View>
    </Scrim>
  );
}

export interface EpisodeErrorCardProps {
  error?: unknown;
  title?: string;
  message?: string;
  onRetry: () => void;
  onNext?: () => void;
  /** DIAGNOSTIC (u10): raw native error + session info, small text under the card. */
  detail?: string;
}

/** Inline failure for a single episode, keeps the pager usable. */
export function EpisodeErrorCard({ error, title, message, onRetry, onNext, detail }: EpisodeErrorCardProps) {
  return (
    <View style={styles.scrim}>
      <ErrorState error={error} title={title} message={message} onRetry={onRetry} compact />
      {detail ? (
        <AppText variant="caption" color="textMuted" align="center" style={{ marginTop: spacing[2], paddingHorizontal: spacing[4] }}>
          {detail}
        </AppText>
      ) : null}
      {onNext && (
        <GradientButton
          label="Episode berikutnya"
          icon="play-skip-forward"
          variant="secondary"
          size="md"
          onPress={onNext}
          style={styles.nextBtn}
        />
      )}
    </View>
  );
}

export interface UpNextCardProps {
  nextEpisode: number;
  onPlayNext: () => void;
  onReplay: () => void;
}

/** Autoplay is off: offer the next episode explicitly when one ends. */
export function UpNextCard({ nextEpisode, onPlayNext, onReplay }: UpNextCardProps) {
  return (
    <Scrim>
      <AppText variant="overline" color="textSecondary" align="center">
        Episode selesai
      </AppText>
      <View style={styles.actions}>
        <GradientButton label={`Tonton EP ${nextEpisode}`} icon="play" onPress={onPlayNext} fullWidth />
        <GradientButton label="Tonton ulang" icon="refresh" variant="secondary" onPress={onReplay} fullWidth />
      </View>
    </Scrim>
  );
}

const styles = StyleSheet.create({
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[8],
  },
  content: { width: '100%', maxWidth: 340, alignItems: 'center' },
  halo: {
    width: 84,
    height: 84,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[4],
  },
  haloInner: {
    width: 64,
    height: 64,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(245,184,65,0.35)',
  },
  title: { marginTop: spacing[2] },
  message: { marginTop: spacing[2] },
  actions: { alignSelf: 'stretch', gap: spacing[3], marginTop: spacing[6] },
  nextBtn: { alignSelf: 'center', marginTop: spacing[3] },
});
