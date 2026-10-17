import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { Drama } from '@/api/types';
import {
  EDIT_BAR_HEIGHT,
  EditActionBar,
  FavoritesGrid,
  HistoryList,
  SegmentedControl,
  confirmDestructive,
  groupHistory,
  type SegmentOption,
} from '@/components/library';
import { useTabBarSpace } from '@/components/navigation/useTabBarSpace';
import { EmptyState, LoadingGrid, LoadingList } from '@/components/states';
import { AppText } from '@/components/ui/AppText';
import { FadeIn } from '@/components/ui/FadeIn';
import { PressableScale } from '@/components/ui/PressableScale';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { haptics } from '@/lib/haptics';
import { watchHref } from '@/lib/routes';
import {
  dramaKey,
  toast,
  useContinueWatching,
  useFavorites,
  useHistory,
  useLibrary,
  useStoresHydrated,
  type HistoryEntry,
} from '@/store';
import { layout, spacing } from '@/theme';

type LibraryTab = 'favorit' | 'riwayat';

/** "Daftarku": favorites grid (with multi-select edit mode) and day-grouped watch history. */
export default function LibraryScreen() {
  const hydrated = useStoresHydrated();
  const favorites = useFavorites();
  const history = useContinueWatching();
  const listBottom = useTabBarSpace();
  const barBottom = useTabBarSpace(spacing[2]);

  const [tab, setTab] = useState<LibraryTab>('favorit');
  const [editing, setEditing] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);

  const onFavorites = tab === 'favorit';
  const hasFavorites = favorites.length > 0;
  const isEditing = editing && onFavorites && hasFavorites;

  // Selection is always filtered against live favorites, so externally removed items drop out.
  const selected = useMemo(() => {
    const live = new Set(favorites.map((f) => dramaKey(f.drama.source, f.drama.id)));
    return new Set(selectedKeys.filter((k) => live.has(k)));
  }, [favorites, selectedKeys]);

  const sections = useMemo(() => groupHistory(history), [history]);

  const options: SegmentOption<LibraryTab>[] = [
    { value: 'favorit', label: 'Favorit', count: hydrated ? favorites.length : undefined, countNoun: 'drama' },
    { value: 'riwayat', label: 'Riwayat', count: hydrated ? history.length : undefined, countNoun: 'drama' },
  ];

  const changeTab = (next: LibraryTab) => {
    if (next === tab) return;
    setTab(next);
    setEditing(false);
    setSelectedKeys([]);
  };

  const toggleEditing = () => {
    haptics.selection();
    setEditing((e) => !e);
    setSelectedKeys([]);
  };

  const toggleSelect = (drama: Drama) => {
    const key = dramaKey(drama.source, drama.id);
    haptics.selection();
    setSelectedKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const enterEdit = (drama: Drama) => {
    haptics.medium();
    setEditing(true);
    setSelectedKeys([dramaKey(drama.source, drama.id)]);
  };

  const toggleAll = () => {
    const all = selected.size === favorites.length;
    setSelectedKeys(all ? [] : favorites.map((f) => dramaKey(f.drama.source, f.drama.id)));
  };

  const deleteSelected = () => {
    const targets = favorites.filter((f) => selected.has(dramaKey(f.drama.source, f.drama.id)));
    if (targets.length === 0) return;
    const { removeFavorite } = useLibrary.getState();
    targets.forEach((f) => removeFavorite(f.drama.source, f.drama.id));
    haptics.success();
    toast.show(`${targets.length} drama dihapus dari Favorit`);
    setSelectedKeys([]);
    if (targets.length === favorites.length) setEditing(false);
  };

  const openHistory = (entry: HistoryEntry) => {
    router.push(watchHref(entry.drama.source, entry.drama.id, entry.lastEpisode));
  };

  const removeHistory = (entry: HistoryEntry) => {
    useHistory.getState().remove(entry.drama.source, entry.drama.id);
    toast.show('Dihapus dari riwayat');
  };

  const clearHistory = async () => {
    const ok = await confirmDestructive({
      title: 'Hapus semua riwayat?',
      message: 'Riwayat tontonan akan dihapus dari perangkat ini.',
      confirmLabel: 'Hapus',
    });
    if (!ok) return;
    useHistory.getState().clear();
    haptics.success();
    toast.show('Riwayat tontonan dihapus');
  };

  const goExplore = () => router.navigate('/');

  const headerAction = !hydrated
    ? null
    : onFavorites
      ? hasFavorites
        ? {
            label: isEditing ? 'Selesai' : 'Edit',
            a11y: isEditing ? 'Selesai mengedit favorit' : 'Edit favorit',
            color: isEditing ? 'primary' : 'text',
            onPress: toggleEditing,
          }
        : null
      : history.length > 0
        ? { label: 'Hapus semua', a11y: 'Hapus semua riwayat', color: 'danger', onPress: clearHistory }
        : null;

  const bottomPadding = isEditing ? listBottom + EDIT_BAR_HEIGHT + spacing[2] : listBottom;

  let content;
  if (!hydrated) {
    content = onFavorites ? (
      <LoadingGrid style={styles.skeleton} />
    ) : (
      <LoadingList style={styles.skeleton} />
    );
  } else if (onFavorites) {
    content = hasFavorites ? (
      <FavoritesGrid
        entries={favorites}
        editing={isEditing}
        selected={selected}
        onToggle={toggleSelect}
        onEnterEdit={enterEdit}
        bottomPadding={bottomPadding}
      />
    ) : (
      <EmptyState
        icon="heart-outline"
        title="Belum ada favorit"
        message="Ketuk ikon hati di drama yang kamu suka untuk menyimpannya di sini."
        actionLabel="Jelajahi drama"
        actionIcon="compass-outline"
        onAction={goExplore}
        style={{ paddingBottom: listBottom }}
      />
    );
  } else {
    content =
      history.length > 0 ? (
        <HistoryList sections={sections} onOpen={openHistory} onRemove={removeHistory} bottomPadding={listBottom} />
      ) : (
        <EmptyState
          icon="time-outline"
          tone="gold"
          title="Belum ada riwayat"
          message="Drama yang kamu tonton akan muncul di sini supaya mudah dilanjutkan."
          actionLabel="Jelajahi drama"
          actionIcon="compass-outline"
          onAction={goExplore}
          style={{ paddingBottom: listBottom }}
        />
      );
  }

  return (
    <ScreenContainer>
      <View style={styles.column}>
        <View style={styles.header}>
          <AppText variant="h1" accessibilityRole="header">
            Daftarku
          </AppText>
          {headerAction && (
            <PressableScale
              onPress={headerAction.onPress}
              activeScale={0.94}
              accessibilityLabel={headerAction.a11y}
              hitSlop={6}
              style={styles.action}>
              <AppText variant="bodyMedium" weight="semibold" color={headerAction.color}>
                {headerAction.label}
              </AppText>
            </PressableScale>
          )}
        </View>

        <SegmentedControl options={options} value={tab} onChange={changeTab} style={styles.segmented} />

        <FadeIn key={tab} rise={false} style={styles.content}>
          {content}
        </FadeIn>
      </View>

      {onFavorites && hasFavorites && (
        <EditActionBar
          visible={isEditing}
          selectedCount={selected.size}
          totalCount={favorites.length}
          bottom={barBottom}
          onToggleAll={toggleAll}
          onDelete={deleteSelected}
        />
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  column: { flex: 1, width: '100%', maxWidth: layout.maxContentWidth, alignSelf: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: layout.minTapTarget,
    paddingHorizontal: layout.gutter,
    paddingTop: spacing[3],
    paddingBottom: spacing[2],
  },
  action: {
    minHeight: layout.minTapTarget,
    paddingLeft: spacing[3],
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  segmented: { marginHorizontal: layout.gutter, marginTop: spacing[2] },
  content: { flex: 1 },
  skeleton: { paddingTop: spacing[5] },
});
