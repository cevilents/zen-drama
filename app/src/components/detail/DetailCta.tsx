import { router } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { usePrefetchEpisode } from '@/api/hooks';
import type { Drama, EpisodeRef } from '@/api/types';
import { ProgressBar } from '@/components/drama/ProgressBar';
import { AppText } from '@/components/ui/AppText';
import { GradientButton } from '@/components/ui/GradientButton';
import { episodeCount, formatDuration, progressRatio } from '@/lib/format';
import { watchHref } from '@/lib/routes';
import type { HistoryEntry } from '@/store';
import { spacing } from '@/theme';

interface Target {
  episode: number;
  label: string;
  /** True when the button resumes an unfinished episode, so its progress is meaningful. */
  resume: boolean;
}

function resolveTarget(entry: HistoryEntry | undefined, total: number): Target {
  if (!entry) return { episode: 1, label: 'Tonton EP 1', resume: false };
  const last = entry.lastEpisode;
  if (entry.watched[last]) {
    // Finished the last-watched episode: continue with the next one, or rewatch once the series is done.
    return !total || last < total
      ? { episode: last + 1, label: `Lanjutkan EP ${last + 1}`, resume: false }
      : { episode: 1, label: 'Tonton ulang', resume: false };
  }
  return { episode: last, label: `Lanjutkan EP ${last}`, resume: true };
}

export interface DetailCtaProps {
  drama: Drama & { episodes?: EpisodeRef[] };
  entry?: HistoryEntry;
}

/** Primary play button: "Tonton EP 1" / "Lanjutkan EP N" / "Tonton ulang", with resume progress underneath. */
export function DetailCta({ drama, entry }: DetailCtaProps) {
  const prefetchEpisode = usePrefetchEpisode();
  const { episode, label, resume } = resolveTarget(entry, episodeCount(drama));

  // Warm the player's episode query so playback starts faster after the tap.
  useEffect(() => {
    prefetchEpisode(drama.source, drama.id, episode);
  }, [prefetchEpisode, drama.source, drama.id, episode]);

  const showProgress = resume && !!entry && entry.durationSec > 0;

  return (
    <View>
      <GradientButton
        label={label}
        icon="play"
        size="lg"
        fullWidth
        accessibilityHint="Buka pemutar video"
        onPress={() => router.push(watchHref(drama.source, drama.id, episode))}
      />
      {showProgress && (
        <View style={styles.progress}>
          <ProgressBar progress={progressRatio(entry.positionSec, entry.durationSec)} />
          <AppText variant="caption" color="textMuted" align="center" tabular style={styles.caption}>
            {`EP ${episode} · tersisa ${formatDuration(Math.max(0, entry.durationSec - entry.positionSec))}`}
          </AppText>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  progress: { marginTop: spacing[3] },
  caption: { marginTop: spacing[2] },
});
