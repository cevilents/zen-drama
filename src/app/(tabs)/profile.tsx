import Constants from 'expo-constants';
import { useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Wordmark } from '@/components/home/Wordmark';
import { useTabBarSpace } from '@/components/navigation/useTabBarSpace';
import {
  confirmDestructive,
  formatQuality,
  formatRate,
  OptionSheet,
  ServerSheet,
  SettingsGroup,
  SettingsRow,
  type Option,
} from '@/components/profile';
import { AppText } from '@/components/ui/AppText';
import { FadeIn } from '@/components/ui/FadeIn';
import { GradientButton } from '@/components/ui/GradientButton';
import { isOwner, setOwner } from '@/lib/owner';
import {
  PLAYBACK_RATES,
  toast,
  useHistory,
  useRecentSearches,
  useSettings,
  type ContentLang,
  type PlaybackRate,
  type SubtitleLang,
} from '@/store';
import { colors, layout, spacing } from '@/theme';

type SheetKind = 'rate' | 'quality' | 'contentLang' | 'subtitleLang' | 'server' | null;

const RATE_OPTIONS: Option<PlaybackRate>[] = PLAYBACK_RATES.map((r) => ({
  value: r,
  label: formatRate(r),
  hint: r === 1 ? 'Normal' : undefined,
}));

const QUALITY_OPTIONS: Option<string>[] = [
  { value: 'auto', label: 'Otomatis', hint: 'Disarankan' },
  { value: '1080p', label: '1080p' },
  { value: '720p', label: '720p' },
  { value: '540p', label: '540p' },
];

const CONTENT_LANG_OPTIONS: Option<ContentLang>[] = [
  { value: 'id', label: 'Indonesia', hint: 'Semua sumber' },
  { value: 'en', label: 'English', hint: 'Sumber berbahasa Inggris' },
];

const SUBTITLE_OPTIONS: Option<SubtitleLang>[] = [
  { value: 'auto', label: 'Otomatis', hint: 'Ikut bahasa konten' },
  { value: 'id', label: 'Indonesia' },
  { value: 'en', label: 'English' },
  { value: 'off', label: 'Mati' },
];

function optionLabel<T extends string>(options: Option<T>[], value: T): string {
  return options.find((o) => o.value === value)?.label ?? value;
}

const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';
// Bumped on every OTA so we can confirm on-device which JS build is live. Tell the user to read it.
const BUILD_TAG = 'u12';

// The server address is hidden from users; tapping the footer logo this many times opens it.
const SECRET_TAPS = 7;
const SECRET_TAP_WINDOW_MS = 2000;
/** PIN that unlocks owner (ad-free) mode from the hidden footer trigger. */
const OWNER_PIN = '314151';

/** "Pengaturan" tab: playback preferences, data cleanup, about. */
export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const bottomSpace = useTabBarSpace(spacing[8]);

  const autoplayNext = useSettings((s) => s.autoplayNext);
  const dataSaver = useSettings((s) => s.dataSaver);
  const playbackRate = useSettings((s) => s.playbackRate);
  const preferredQuality = useSettings((s) => s.preferredQuality);
  const setAutoplayNext = useSettings((s) => s.setAutoplayNext);
  const setDataSaver = useSettings((s) => s.setDataSaver);
  const setPlaybackRate = useSettings((s) => s.setPlaybackRate);
  const setPreferredQuality = useSettings((s) => s.setPreferredQuality);
  const contentLang = useSettings((s) => s.contentLang);
  const subtitleLang = useSettings((s) => s.subtitleLang);
  const setContentLang = useSettings((s) => s.setContentLang);
  const setSubtitleLang = useSettings((s) => s.setSubtitleLang);

  const historyEntries = useHistory((s) => s.entries);
  const searchCount = useRecentSearches((s) => s.queries.length);

  const [sheet, setSheet] = useState<SheetKind>(null);
  const [serverSession, setServerSession] = useState(0);
  const [owner, setOwnerState] = useState(isOwner);
  const [pinOpen, setPinOpen] = useState(false);
  const [pin, setPin] = useState('');
  const closeSheet = () => setSheet(null);

  const submitPin = () => {
    if (pin !== OWNER_PIN) {
      toast.error('PIN salah');
      return;
    }
    setPinOpen(false);
    setOwner(true);
    setOwnerState(true);
    toast.success('Mode owner aktif — iklan dimatikan');
  };

  const toggleOwner = (on: boolean) => {
    setOwner(on);
    setOwnerState(on);
    toast.success(on ? 'Mode bebas iklan aktif' : 'Mode bebas iklan nonaktif');
  };

  // Catalog queries are keyed by language, so every list refetches for the new catalog on its own.
  const changeContentLang = (lang: ContentLang) => {
    if (lang === contentLang) return;
    setContentLang(lang);
    toast.success(lang === 'en' ? 'Katalog bahasa Inggris aktif' : 'Katalog bahasa Indonesia aktif');
  };

  const historyCount = useMemo(() => Object.keys(historyEntries).length, [historyEntries]);

  const secretTaps = useRef({ count: 0, last: 0 });
  const onLogoTap = () => {
    const now = Date.now();
    const taps = secretTaps.current;
    taps.count = now - taps.last < SECRET_TAP_WINDOW_MS ? taps.count + 1 : 1;
    taps.last = now;
    if (taps.count < SECRET_TAPS) return;
    taps.count = 0;
    setServerSession((n) => n + 1);
    setSheet('server');
  };

  const clearHistory = () => {
    if (historyCount === 0) {
      toast.show('Riwayat tonton sudah kosong');
      return;
    }
    confirmDestructive({
      title: 'Hapus riwayat tonton?',
      message: `${historyCount} drama beserta progres menontonnya akan dihapus dari perangkat ini.`,
      onConfirm: () => {
        useHistory.getState().clear();
        toast.success('Riwayat tonton dihapus');
      },
    });
  };

  const clearSearches = () => {
    if (searchCount === 0) {
      toast.show('Belum ada pencarian tersimpan');
      return;
    }
    confirmDestructive({
      title: 'Hapus pencarian terakhir?',
      message: `${searchCount} kata pencarian akan dihapus dari perangkat ini.`,
      onConfirm: () => {
        useRecentSearches.getState().clear();
        toast.success('Pencarian terakhir dihapus');
      },
    });
  };

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + spacing[3], paddingBottom: bottomSpace }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="never">
        <View style={styles.content}>
          <FadeIn delay={0}>
            <AppText variant="h1" accessibilityRole="header">
              Pengaturan
            </AppText>
          </FadeIn>

          <FadeIn delay={40}>
            <SettingsGroup title="Pemutaran">
              <SettingsRow
                variant="switch"
                icon="play-forward"
                tone="primary"
                title="Putar otomatis episode berikutnya"
                switchValue={autoplayNext}
                onSwitchChange={setAutoplayNext}
              />
              <SettingsRow
                icon="speedometer"
                tone="primaryAlt"
                title="Kecepatan default"
                value={formatRate(playbackRate)}
                onPress={() => setSheet('rate')}
                accessibilityHint="Pilih kecepatan pemutaran bawaan"
              />
              <SettingsRow
                icon="sparkles"
                tone="gold"
                title="Kualitas"
                value={formatQuality(preferredQuality)}
                onPress={() => setSheet('quality')}
                accessibilityHint="Pilih kualitas video bawaan"
              />
              <SettingsRow
                variant="switch"
                icon="leaf"
                tone="success"
                title="Hemat data"
                subtitle="Pakai kualitas rendah saat memutar"
                switchValue={dataSaver}
                onSwitchChange={setDataSaver}
              />
            </SettingsGroup>
          </FadeIn>

          <FadeIn delay={60}>
            <SettingsGroup title="Bahasa">
              <SettingsRow
                icon="language"
                tone="primary"
                title="Bahasa konten"
                value={optionLabel(CONTENT_LANG_OPTIONS, contentLang)}
                onPress={() => setSheet('contentLang')}
                accessibilityHint="Pilih bahasa katalog drama"
              />
              <SettingsRow
                icon="chatbox-ellipses"
                tone="primaryAlt"
                title="Subtitle"
                value={optionLabel(SUBTITLE_OPTIONS, subtitleLang)}
                onPress={() => setSheet('subtitleLang')}
                accessibilityHint="Pilih bahasa subtitle bawaan"
              />
            </SettingsGroup>
          </FadeIn>

          <FadeIn delay={80}>
            <SettingsGroup title="Data">
              <SettingsRow
                variant="destructive"
                icon="trash"
                title="Hapus riwayat tonton"
                value={`${historyCount} drama`}
                onPress={clearHistory}
              />
              <SettingsRow
                variant="destructive"
                icon="search"
                title="Hapus pencarian terakhir"
                value={`${searchCount} kata`}
                onPress={clearSearches}
              />
            </SettingsGroup>
          </FadeIn>

          <FadeIn delay={120}>
            <SettingsGroup title="Tentang">
              <SettingsRow variant="info" icon="information-circle" title="Versi aplikasi" value={`${APP_VERSION} · ${BUILD_TAG}`} />
              <SettingsRow
                variant="info"
                icon="link"
                tone="gold"
                title="Sumber konten"
                subtitle="Agregator pihak ketiga, untuk penggunaan pribadi."
              />
            </SettingsGroup>
          </FadeIn>

          {owner && (
            <FadeIn delay={140}>
              <SettingsGroup title="Mode owner">
                <SettingsRow
                  variant="switch"
                  icon="shield-checkmark"
                  tone="success"
                  title="Mode bebas iklan"
                  subtitle="Hanya di perangkat ini"
                  switchValue={owner}
                  onSwitchChange={toggleOwner}
                />
              </SettingsGroup>
            </FadeIn>
          )}

          <FadeIn delay={160}>
            <View style={styles.footer}>
              <Pressable onPress={onLogoTap} accessible={false} hitSlop={16}>
                <Wordmark size={18} />
              </Pressable>
              <Pressable
                onPress={() => {
                  setPin('');
                  setPinOpen(true);
                }}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Versi aplikasi">
                <AppText variant="caption" color="textMuted">
                  Dibuat untuk penikmat drama pendek
                </AppText>
              </Pressable>
            </View>
          </FadeIn>
        </View>
      </ScrollView>

      <OptionSheet
        visible={sheet === 'rate'}
        onClose={closeSheet}
        title="Kecepatan default"
        options={RATE_OPTIONS}
        selected={playbackRate}
        onSelect={setPlaybackRate}
      />
      <OptionSheet
        visible={sheet === 'quality'}
        onClose={closeSheet}
        title="Kualitas"
        options={QUALITY_OPTIONS}
        selected={preferredQuality}
        onSelect={setPreferredQuality}
      />
      <OptionSheet
        visible={sheet === 'contentLang'}
        onClose={closeSheet}
        title="Bahasa konten"
        options={CONTENT_LANG_OPTIONS}
        selected={contentLang}
        onSelect={changeContentLang}
      />
      <OptionSheet
        visible={sheet === 'subtitleLang'}
        onClose={closeSheet}
        title="Subtitle"
        options={SUBTITLE_OPTIONS}
        selected={subtitleLang}
        onSelect={setSubtitleLang}
      />
      <ServerSheet key={serverSession} visible={sheet === 'server'} onClose={closeSheet} />

      <Modal visible={pinOpen} transparent animationType="fade" onRequestClose={() => setPinOpen(false)}>
        <View style={styles.pinRoot}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setPinOpen(false)} />
          <View style={styles.pinCard}>
            <AppText variant="h2" align="center">
              Masukkan PIN
            </AppText>
            <TextInput
              value={pin}
              onChangeText={setPin}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={6}
              autoFocus
              placeholder="••••••"
              placeholderTextColor="#6b6b76"
              style={styles.pinInput}
              onSubmitEditing={submitPin}
            />
            <GradientButton label="Buka" icon="key" onPress={submitPin} fullWidth />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { alignItems: 'center' },
  content: {
    width: '100%',
    maxWidth: layout.maxContentWidth,
    paddingHorizontal: layout.gutter,
    gap: spacing[6],
  },
  footer: { alignItems: 'center', gap: spacing[1], paddingTop: spacing[2] },
  pinRoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: spacing[6],
  },
  pinCard: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: spacing[6],
    gap: spacing[4],
  },
  pinInput: {
    height: 48,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    backgroundColor: colors.bg,
    color: colors.white,
    textAlign: 'center',
    fontSize: 22,
    letterSpacing: 8,
  },
});
