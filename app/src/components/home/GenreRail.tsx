import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { memo } from 'react';
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { SectionHeader } from '@/components/drama/SectionHeader';
import { AppText } from '@/components/ui/AppText';
import { PressableScale } from '@/components/ui/PressableScale';
import { colors, layout, radii, spacing } from '@/theme';

import { GENRES, searchHref, type Genre } from './meta';

/** Alternating warm accents so the rail has rhythm without inventing new colours. */
const ACCENTS = [
  { fg: colors.primary, glow: [colors.primarySoft, 'rgba(255,45,85,0)'] as const },
  { fg: colors.gold, glow: [colors.goldSoft, 'rgba(245,184,65,0)'] as const },
  { fg: colors.primaryAlt, glow: ['rgba(255,106,61,0.16)', 'rgba(255,106,61,0)'] as const },
];

/** "Jelajahi Genre": tappable genre tiles that open Search with the keyword prefilled. */
export const GenreRail = memo(function GenreRail({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <View style={style}>
      <SectionHeader title="Jelajahi Genre" icon="compass" subtitle="Temukan drama sesuai selera" />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.content}
        decelerationRate="fast">
        {GENRES.map((g, i) => (
          <GenreTile key={g.label} genre={g} accent={ACCENTS[i % ACCENTS.length]} />
        ))}
      </ScrollView>
    </View>
  );
});

function GenreTile({ genre, accent }: { genre: Genre; accent: (typeof ACCENTS)[number] }) {
  return (
    <PressableScale
      onPress={() => router.push(searchHref(genre.query))}
      haptic="selection"
      accessibilityLabel={`Genre ${genre.label}`}
      accessibilityHint="Cari drama dengan genre ini"
      style={styles.tile}>
      <LinearGradient
        colors={accent.glow}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.icon, { borderColor: accent.fg }]}>
        <Ionicons name={genre.icon} size={15} color={accent.fg} />
      </View>
      <AppText variant="label" numberOfLines={1}>
        {genre.label}
      </AppText>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: layout.gutter, paddingTop: spacing[3], gap: spacing[2.5] },
  tile: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2.5],
    paddingLeft: spacing[2.5],
    paddingRight: spacing[4],
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  icon: {
    width: 30,
    height: 30,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    backgroundColor: colors.bg,
  },
});
