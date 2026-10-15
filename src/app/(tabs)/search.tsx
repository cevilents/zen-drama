import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  FlatList,
  Keyboard,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type ListRenderItem,
  type TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSearch, useSources } from '@/api/hooks';
import type { Drama } from '@/api/types';
import { DramaCardWide } from '@/components/drama/DramaCardWide';
import { useQuickActions } from '@/components/home/QuickActionsSheet';
import { useTabBarSpace } from '@/components/navigation/useTabBarSpace';
import { PopularKeywords, POPULAR_KEYWORDS } from '@/components/search/PopularKeywords';
import { RecentSearches } from '@/components/search/RecentSearches';
import { SearchField } from '@/components/search/SearchField';
import { SourceFilter } from '@/components/search/SourceFilter';
import { TrendingList } from '@/components/search/TrendingList';
import { useDebouncedValue } from '@/components/search/useDebouncedValue';
import { EmptyState } from '@/components/states/EmptyState';
import { ErrorState } from '@/components/states/ErrorState';
import { LoadingList } from '@/components/states/Loading';
import { AppText } from '@/components/ui/AppText';
import { Chip } from '@/components/ui/Chip';
import { FadeIn } from '@/components/ui/FadeIn';
import { dramaHref } from '@/lib/routes';
import { useRecentSearches } from '@/store/useRecentSearches';
import { colors, layout, spacing } from '@/theme';

const DEBOUNCE_MS = 350;
/** A query that stays on screen this long (with results) is remembered. */
const REMEMBER_AFTER_MS = 1500;
const MIN_QUERY = 2;

const keyOf = (d: Drama) => `${d.source}:${d.id}`;
const Separator = () => <View style={styles.sep} />;

function addRecent(q: string) {
  useRecentSearches.getState().add(q);
}

export default function SearchScreen() {
  const params = useLocalSearchParams<{ q?: string; t?: string; focus?: string }>();
  const insets = useSafeAreaInsets();
  const tabBarSpace = useTabBarSpace(spacing[6]);
  const inputRef = useRef<TextInput>(null);
  const sources = useSources();
  const { open: openQuick, sheet } = useQuickActions();

  const hasRecent = useRecentSearches((s) => s.queries.length > 0);
  const [text, setText] = useState(params.q ?? '');
  const [source, setSource] = useState<string | undefined>(undefined);

  // Prefill from route params (genre chips on Home). `t` changes on every tap, so re-tapping re-syncs.
  const paramKey = `${params.q ?? ''}|${params.t ?? ''}`;
  const [syncedKey, setSyncedKey] = useState(paramKey);
  if (paramKey !== syncedKey) {
    setSyncedKey(paramKey);
    if (params.q != null) {
      setText(params.q);
      setSource(undefined);
    }
  }

  // Autofocus only when navigated with intent (Home search icon passes `focus`).
  useEffect(() => {
    if (!params.focus) return;
    const t = setTimeout(() => inputRef.current?.focus(), 280);
    return () => clearTimeout(t);
  }, [params.focus]);

  const query = useDebouncedValue(text.trim(), DEBOUNCE_MS);
  const active = query.length >= MIN_QUERY;
  // A source picked in one language may have no catalog in the other: search everything then.
  const activeSource = source && sources.data && !sources.data.some((s) => s.id === source) ? undefined : source;
  const search = useSearch(query, activeSource);
  const results = active ? (search.data ?? []) : [];
  const stale = search.isPlaceholderData;
  const typing = text.trim() !== query;

  useEffect(() => {
    if (!active || stale || !results.length) return;
    const t = setTimeout(() => addRecent(query), REMEMBER_AFTER_MS);
    return () => clearTimeout(t);
  }, [active, stale, results.length, query]);

  const pick = useCallback((q: string) => {
    setText(q);
    addRecent(q);
    Keyboard.dismiss();
  }, []);

  const cancel = () => {
    setText('');
    inputRef.current?.blur();
    Keyboard.dismiss();
  };

  const openResult = useCallback(
    (d: Drama) => {
      addRecent(query);
      router.push(dramaHref(d));
    },
    [query],
  );

  const renderItem = useCallback<ListRenderItem<Drama>>(
    ({ item }) => <DramaCardWide drama={item} highlight={query} onPress={openResult} onLongPress={openQuick} />,
    [query, openResult, openQuick],
  );

  const sourceName = activeSource ? (sources.data?.find((s) => s.id === activeSource)?.name ?? activeSource) : null;

  let body: ReactNode;
  if (!active) {
    body = (
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.idle, { paddingBottom: tabBarSpace }]}>
        {hasRecent && (
          <FadeIn>
            <RecentSearches onPick={pick} />
          </FadeIn>
        )}
        <FadeIn delay={60}>
          <PopularKeywords onPick={pick} />
        </FadeIn>
        <FadeIn delay={120}>
          <TrendingList />
        </FadeIn>
      </ScrollView>
    );
  } else if (search.isPending || (stale && !results.length)) {
    body = <LoadingList count={6} style={styles.loading} />;
  } else if (search.isError && !search.data) {
    body = (
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.grow, { paddingBottom: tabBarSpace }]}>
        <ErrorState error={search.error} onRetry={() => search.refetch()} />
      </ScrollView>
    );
  } else if (!results.length && !stale) {
    body = (
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={[styles.grow, { paddingBottom: tabBarSpace }]}>
        <EmptyState
          icon="search-outline"
          tone="muted"
          title={`Tidak ditemukan untuk “${query}”`}
          message={
            sourceName
              ? `Belum ada judul yang cocok di ${sourceName}. Coba cari di semua sumber atau kata kunci lain.`
              : 'Periksa ejaan atau coba kata kunci yang lebih umum.'
          }
          actionLabel={sourceName ? 'Cari di semua sumber' : undefined}
          actionIcon="globe-outline"
          actionVariant="secondary"
          onAction={sourceName ? () => setSource(undefined) : undefined}
          footer={
            <View style={styles.suggest}>
              <AppText variant="caption" color="textMuted" align="center">
                Coba salah satu ini
              </AppText>
              <View style={styles.suggestChips}>
                {POPULAR_KEYWORDS.slice(0, 6).map((k) => (
                  <Chip key={k} label={k} size="sm" onPress={() => pick(k)} />
                ))}
              </View>
            </View>
          }
        />
      </ScrollView>
    );
  } else {
    body = (
      <FlatList
        data={results}
        keyExtractor={keyOf}
        renderItem={renderItem}
        ItemSeparatorComponent={Separator}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        initialNumToRender={8}
        removeClippedSubviews={Platform.OS !== 'web'}
        style={stale && styles.dim}
        contentContainerStyle={[styles.results, { paddingBottom: tabBarSpace }]}
        ListHeaderComponent={
          <View style={styles.resultsHeader}>
            {stale ? (
              <AppText variant="label" color="textSecondary" numberOfLines={1} style={styles.flex}>
                Mencari “{query}”…
              </AppText>
            ) : (
              <AppText variant="label" color="textSecondary" numberOfLines={1} style={styles.flex}>
                <AppText variant="label" weight="bold">
                  {results.length} hasil
                </AppText>{' '}
                untuk “{query}”{sourceName ? ` di ${sourceName}` : ''}
              </AppText>
            )}
          </View>
        }
      />
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <AppText variant="h1" accessibilityRole="header">
          Cari
        </AppText>
        <AppText variant="bodySm" color="textMuted" style={styles.subtitle}>
          Ribuan drama pendek dari semua sumber
        </AppText>
        <SearchField
          ref={inputRef}
          value={text}
          onChangeText={setText}
          onSubmit={() => addRecent(text)}
          onCancel={cancel}
          loading={active && (search.isFetching || typing) && !search.isPending}
          style={styles.field}
        />
      </View>
      <SourceFilter value={activeSource} onChange={setSource} style={styles.filter} />
      <View style={styles.body}>{body}</View>
      {sheet}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  header: { paddingHorizontal: layout.gutter, paddingTop: spacing[3] },
  subtitle: { marginTop: spacing[0.5] },
  field: { marginTop: spacing[4] },
  filter: { flexGrow: 0, marginTop: spacing[3] },
  body: { flex: 1, marginTop: spacing[2] },
  idle: { paddingHorizontal: layout.gutter, paddingTop: spacing[4], gap: spacing[8] },
  loading: { paddingTop: spacing[4] },
  grow: { flexGrow: 1 },
  results: { paddingHorizontal: layout.gutter },
  resultsHeader: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing[3] },
  sep: { height: spacing[4] },
  dim: { opacity: 0.55 },
  suggest: { marginTop: spacing[6], gap: spacing[3], alignItems: 'center' },
  suggestChips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing[2] },
});
