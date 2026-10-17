import { StyleSheet, Switch, View } from 'react-native';

import type { Quality, Subtitle } from '@/api/types';
import { AppText } from '@/components/ui/AppText';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Chip } from '@/components/ui/Chip';
import { Divider } from '@/components/ui/Divider';
import { PLAYBACK_RATES, useSettings } from '@/store/useSettings';
import { colors, spacing } from '@/theme';

import { pickSubtitle, type SubtitleChoice } from './pickSubtitle';

export interface PlaybackSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Qualities of the current episode; the picker shows only when there is a real choice. */
  qualities: Quality[];
  /** Subtitle tracks of the current episode; the picker hides when there are none. */
  subtitles: Subtitle[];
  /** Session subtitle choice; null = follow the subtitle setting. */
  subtitleChoice: SubtitleChoice | null;
  onSubtitleChoice: (choice: SubtitleChoice) => void;
}

function rateLabel(rate: number): string {
  return rate === 1 ? 'Normal' : `${String(rate).replace('.', ',')}x`;
}

/** Speed, quality and autoplay settings for the player (persisted in useSettings). */
export function PlaybackSheet({
  visible,
  onClose,
  qualities,
  subtitles,
  subtitleChoice,
  onSubtitleChoice,
}: PlaybackSheetProps) {
  const rate = useSettings((s) => s.playbackRate);
  const setRate = useSettings((s) => s.setPlaybackRate);
  const quality = useSettings((s) => s.preferredQuality);
  const setQuality = useSettings((s) => s.setPreferredQuality);
  const autoplayNext = useSettings((s) => s.autoplayNext);
  const setAutoplayNext = useSettings((s) => s.setAutoplayNext);
  const activeQuality = qualities.some((q) => q.label === quality) ? quality : 'auto';
  const subtitleLang = useSettings((s) => s.subtitleLang);
  const contentLang = useSettings((s) => s.contentLang);
  const activeSubtitle = pickSubtitle(subtitles, subtitleChoice, subtitleLang, contentLang);

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Pengaturan Pemutaran">
      <AppText variant="overline" color="textMuted" style={styles.label}>
        Kecepatan
      </AppText>
      <View style={styles.wrap}>
        {PLAYBACK_RATES.map((r) => (
          <Chip key={r} label={rateLabel(r)} selected={r === rate} onPress={() => setRate(r)} />
        ))}
      </View>

      {qualities.length > 1 && (
        <>
          <AppText variant="overline" color="textMuted" style={[styles.label, styles.section]}>
            Kualitas
          </AppText>
          <View style={styles.wrap}>
            <Chip label="Otomatis" selected={activeQuality === 'auto'} onPress={() => setQuality('auto')} />
            {qualities.map((q) => (
              <Chip key={q.label} label={q.label} selected={activeQuality === q.label} onPress={() => setQuality(q.label)} />
            ))}
          </View>
        </>
      )}

      {subtitles.length > 0 && (
        <>
          <AppText variant="overline" color="textMuted" style={[styles.label, styles.section]}>
            Subtitle
          </AppText>
          <View style={styles.wrap}>
            <Chip label="Mati" selected={!activeSubtitle} onPress={() => onSubtitleChoice('off')} />
            {subtitles.map((s, i) => (
              <Chip
                key={`${i}-${s.language}-${s.label}`}
                label={s.label || s.language.toUpperCase() || 'Subtitle'}
                selected={s === activeSubtitle}
                onPress={() => onSubtitleChoice({ language: s.language, label: s.label })}
              />
            ))}
          </View>
        </>
      )}

      <Divider spacingY={spacing[5]} />
      <View style={styles.switchRow}>
        <View style={styles.switchText}>
          <AppText variant="bodyMedium">Putar otomatis</AppText>
          <AppText variant="caption" color="textMuted">
            Lanjut ke episode berikutnya saat episode selesai
          </AppText>
        </View>
        <Switch
          value={autoplayNext}
          onValueChange={setAutoplayNext}
          trackColor={{ false: colors.elevated, true: colors.primary }}
          thumbColor={colors.white}
          ios_backgroundColor={colors.elevated}
          // react-native-web colors the "on" thumb separately (defaults to teal).
          {...({ activeThumbColor: colors.white } as object)}
          accessibilityLabel="Putar otomatis episode berikutnya"
        />
      </View>
      <View style={styles.bottomSpace} />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  label: { marginBottom: spacing[3] },
  section: { marginTop: spacing[5] },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[4] },
  switchText: { flex: 1, gap: 2 },
  bottomSpace: { height: spacing[2] },
});
