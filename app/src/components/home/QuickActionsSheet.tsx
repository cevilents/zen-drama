import { Ionicons } from '@expo/vector-icons';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { Drama } from '@/api/types';
import { PosterImage } from '@/components/drama/PosterImage';
import { AppText } from '@/components/ui/AppText';
import { BottomSheet } from '@/components/ui/BottomSheet';
import type { IoniconName } from '@/components/ui/IconButton';
import { PressableScale } from '@/components/ui/PressableScale';
import { formatViews } from '@/lib/format';
import { haptics } from '@/lib/haptics';
import { useHistoryEntry } from '@/store/useHistory';
import { useIsFavorite } from '@/store/useLibrary';
import { colors, radii, spacing } from '@/theme';

import { openDetail, playDrama, toggleFavorite } from './dramaActions';
import { storyTags } from './meta';

/** Let the sheet start sliding away before the next screen pushes. */
const NAV_DELAY_MS = 180;

export interface QuickActionsSheetProps {
  drama: Drama | null;
  visible: boolean;
  onClose: () => void;
}

/** Long-press menu for a drama card: play / Daftarku / detail. */
export function QuickActionsSheet({ drama, visible, onClose }: QuickActionsSheetProps) {
  return (
    <BottomSheet visible={visible && !!drama} onClose={onClose}>
      {drama && <SheetBody drama={drama} onClose={onClose} />}
    </BottomSheet>
  );
}

function SheetBody({ drama, onClose }: { drama: Drama; onClose: () => void }) {
  const entry = useHistoryEntry(drama.source, drama.id);
  const favorite = useIsFavorite(drama.source, drama.id);

  const meta = [
    ...storyTags(drama, 2),
    drama.totalEpisodes > 0 ? `${drama.totalEpisodes} EP` : null,
    drama.viewCount > 0 ? `${formatViews(drama.viewCount)} ditonton` : null,
  ].filter(Boolean) as string[];

  const thenClose = (fn: () => void) => () => {
    onClose();
    setTimeout(fn, NAV_DELAY_MS);
  };

  return (
    <View style={styles.body}>
      <View style={styles.header}>
        <PosterImage uri={drama.cover} style={styles.poster} radius={radii.sm} accessibilityLabel={drama.title} />
        <View style={styles.headerText}>
          <AppText variant="h3" numberOfLines={2}>
            {drama.title}
          </AppText>
          {meta.length > 0 && (
            <AppText variant="caption" color="textSecondary" numberOfLines={1}>
              {meta.join('  ·  ')}
            </AppText>
          )}
          {drama.isCompleted && (
            <AppText variant="caption" color="success" weight="bold">
              Tamat
            </AppText>
          )}
        </View>
      </View>

      <View style={styles.actions}>
        <ActionRow
          icon="play"
          tone="primary"
          label={entry ? `Lanjut EP ${entry.lastEpisode}` : 'Tonton Sekarang'}
          hint={entry ? 'Lanjutkan dari terakhir kamu tonton' : 'Mulai dari episode 1'}
          onPress={thenClose(() => playDrama(drama))}
        />
        <ActionRow
          icon={favorite ? 'heart-dislike-outline' : 'heart-outline'}
          tone={favorite ? 'muted' : 'gold'}
          label={favorite ? 'Hapus dari Daftarku' : 'Tambah ke Daftarku'}
          onPress={() => {
            toggleFavorite(drama);
            onClose();
          }}
        />
        <ActionRow
          icon="information-circle-outline"
          tone="muted"
          label="Lihat Detail"
          hint="Sinopsis & daftar episode"
          onPress={thenClose(() => openDetail(drama))}
        />
      </View>
    </View>
  );
}

const TONE = {
  primary: { fg: colors.primary, bg: colors.primarySoft },
  gold: { fg: colors.gold, bg: colors.goldSoft },
  muted: { fg: colors.text, bg: colors.elevated },
};

function ActionRow({
  icon,
  label,
  hint,
  tone,
  onPress,
}: {
  icon: IoniconName;
  label: string;
  hint?: string;
  tone: keyof typeof TONE;
  onPress: () => void;
}) {
  const t = TONE[tone];
  return (
    <PressableScale
      onPress={() => {
        haptics.selection();
        onPress();
      }}
      activeScale={0.98}
      accessibilityLabel={label}
      style={styles.action}>
      <View style={[styles.actionIcon, { backgroundColor: t.bg }]}>
        <Ionicons name={icon} size={20} color={t.fg} />
      </View>
      <View style={styles.actionText}>
        <AppText variant="bodyMedium" weight="semibold">
          {label}
        </AppText>
        {hint && (
          <AppText variant="caption" color="textMuted">
            {hint}
          </AppText>
        )}
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
    </PressableScale>
  );
}

/** Owns the sheet state. Render `sheet` once; pass `open` to cards as `onLongPress`. */
export function useQuickActions() {
  const [drama, setDrama] = useState<Drama | null>(null);
  const [visible, setVisible] = useState(false);

  const open = useCallback((d: Drama) => {
    haptics.medium();
    setDrama(d);
    setVisible(true);
  }, []);
  const close = useCallback(() => setVisible(false), []);

  return { open, sheet: <QuickActionsSheet drama={drama} visible={visible} onClose={close} /> };
}

const styles = StyleSheet.create({
  body: { paddingTop: spacing[1], paddingBottom: spacing[2] },
  header: { flexDirection: 'row', gap: spacing[3], alignItems: 'center' },
  poster: { width: 64 },
  headerText: { flex: 1, gap: spacing[1] },
  actions: {
    marginTop: spacing[5],
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingVertical: spacing[1],
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2.5],
    minHeight: 56,
  },
  actionIcon: {
    width: 38,
    height: 38,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: { flex: 1, gap: 2 },
});
