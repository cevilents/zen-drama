import { ScrollView, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { useSources } from '@/api/hooks';
import { Chip } from '@/components/ui/Chip';
import { layout, spacing } from '@/theme';

export interface SourceFilterProps {
  /** undefined = all sources. */
  value: string | undefined;
  onChange: (source: string | undefined) => void;
  style?: StyleProp<ViewStyle>;
}

/** "Semua" + healthy sources. Renders just "Semua" until sources load. */
export function SourceFilter({ value, onChange, style }: SourceFilterProps) {
  const sources = useSources();
  const healthy = (sources.data ?? []).filter((s) => s.healthy || s.id === value);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.content}
      style={style}>
      <Chip label="Semua" icon="apps" size="sm" selected={!value} onPress={() => onChange(undefined)} />
      {healthy.map((s) => (
        <Chip
          key={s.id}
          label={s.name}
          size="sm"
          selected={value === s.id}
          onPress={() => onChange(value === s.id ? undefined : s.id)}
          accessibilityLabel={`Sumber ${s.name}`}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: layout.gutter, gap: spacing[2] },
});
