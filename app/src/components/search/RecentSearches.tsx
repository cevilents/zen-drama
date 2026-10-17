import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { PressableScale } from '@/components/ui/PressableScale';
import { useRecentSearches } from '@/store/useRecentSearches';
import { colors, radii, spacing } from '@/theme';

import { SearchSectionTitle } from './SearchSectionTitle';

/** "Pencarian terakhir": removable chips + "Hapus semua". Hidden when empty. */
export function RecentSearches({ onPick }: { onPick: (q: string) => void }) {
  const queries = useRecentSearches((s) => s.queries);
  const remove = useRecentSearches((s) => s.remove);
  const clear = useRecentSearches((s) => s.clear);

  if (!queries.length) return null;

  return (
    <View>
      <SearchSectionTitle
        title="Pencarian terakhir"
        icon="time-outline"
        action={{ label: 'Hapus semua', onPress: clear }}
      />
      <View style={styles.wrap}>
        {queries.map((q) => (
          // Label and remove are sibling pressables (nested buttons are invalid on web).
          <View key={q} style={styles.chip}>
            <PressableScale
              onPress={() => onPick(q)}
              haptic="selection"
              accessibilityLabel={`Cari ${q}`}
              style={styles.label}>
              <Ionicons name="search-outline" size={13} color={colors.textMuted} />
              <AppText variant="label" color="textSecondary" numberOfLines={1} style={styles.text}>
                {q}
              </AppText>
            </PressableScale>
            <PressableScale
              onPress={() => remove(q)}
              haptic="light"
              activeScale={0.85}
              hitSlop={8}
              accessibilityLabel={`Hapus ${q} dari riwayat pencarian`}
              style={styles.remove}>
              <Ionicons name="close" size={14} color={colors.textMuted} />
            </PressableScale>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 36,
    maxWidth: '100%',
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  label: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1.5],
    height: '100%',
    paddingLeft: spacing[3],
    paddingRight: spacing[1],
    flexShrink: 1,
  },
  text: { flexShrink: 1, maxWidth: 200 },
  remove: { width: 32, height: '100%', alignItems: 'center', justifyContent: 'center' },
});
