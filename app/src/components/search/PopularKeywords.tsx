import { StyleSheet, View } from 'react-native';

import { Chip } from '@/components/ui/Chip';
import { colors, spacing } from '@/theme';

import { SearchSectionTitle } from './SearchSectionTitle';

export const POPULAR_KEYWORDS = [
  'CEO',
  'Balas Dendam',
  'Pernikahan Kontrak',
  'Miliarder',
  'Ratu Mafia',
  'Terlahir Kembali',
  'Manusia Serigala',
  'Identitas Tersembunyi',
  'Cinta Pertama',
  'Alpha',
] as const;

/** "Populer": trending keywords, the top three flagged with a flame. */
export function PopularKeywords({ onPick, title = 'Populer' }: { onPick: (q: string) => void; title?: string }) {
  return (
    <View>
      <SearchSectionTitle title={title} icon="flame" iconColor={colors.primary} />
      <View style={styles.wrap}>
        {POPULAR_KEYWORDS.map((k, i) => (
          <Chip key={k} label={k} size="sm" icon={i < 3 ? 'flame' : undefined} onPress={() => onPick(k)} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
});
