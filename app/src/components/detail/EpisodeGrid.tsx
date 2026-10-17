import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import type { EpisodeRef } from '@/api/types';
import { AppText } from '@/components/ui/AppText';
import { Chip } from '@/components/ui/Chip';
import { episodeRangeTabs } from '@/lib/format';
import { layout, spacing } from '@/theme';

import { EpisodeTile } from './EpisodeTile';

export interface EpisodeGridProps {
  /** Total episode count. */
  total: number;
  /**
   * Per-episode metadata. `locked` is informational only (sources over-report it); the lock badge is
   * hidden for episodes the viewer has already played.
   */
  episodes?: EpisodeRef[];
  /** Highlighted (now / last watched) episode. */
  currentEp?: number;
  /** Episodes fully watched (from history). */
  watched?: Record<number, true>;
  /** Episodes with a saved position (from history) — proven playable, so never shown as locked. */
  played?: Record<number, number>;
  onSelect: (episode: number) => void;
  /** Width available for the grid (without horizontal padding). */
  width: number;
  /** Horizontal padding applied to tabs + grid. Default layout.gutter. */
  inset?: number;
  /** "sheet" = lighter tiles for use on a surface background. */
  tone?: 'page' | 'sheet';
  /** Animate the current tile's eq-bars. Default true. */
  playing?: boolean;
  /** Episodes per range tab. Default 30. */
  rangeSize?: number;
  style?: StyleProp<ViewStyle>;
}

const GAP = spacing[2];
const MIN_TILE = 56;

/** Range pills ("1-30", "31-60", …) + square episode tiles. Shared by Detail and the player's episode sheet. */
export function EpisodeGrid({
  total,
  episodes,
  currentEp,
  watched,
  played,
  onSelect,
  width,
  inset = layout.gutter,
  tone = 'page',
  playing = true,
  rangeSize = 30,
  style,
}: EpisodeGridProps) {
  const tabs = useMemo(() => episodeRangeTabs(total, rangeSize), [total, rangeSize]);
  const tabOf = (ep: number | undefined) =>
    Math.max(0, tabs.findIndex((t) => ep != null && ep >= t.start && ep <= t.end));
  const [tabIndex, setTabIndex] = useState(() => tabOf(currentEp));
  // Follow the current episode when it changes while mounted (e.g. Detail under the player modal).
  const [prevEp, setPrevEp] = useState(currentEp);
  if (currentEp !== prevEp) {
    setPrevEp(currentEp);
    setTabIndex(tabOf(currentEp));
  }
  const selectedIndex = Math.min(tabIndex, tabs.length - 1);
  const tab = tabs[selectedIndex];

  const locked = useMemo(() => {
    const set = new Set<number>();
    episodes?.forEach((e) => {
      if (e.locked && played?.[e.number] == null) set.add(e.number);
    });
    return set;
  }, [episodes, played]);

  const cols = Math.max(5, Math.min(8, Math.floor((width + GAP) / (MIN_TILE + GAP))));
  const tileSize = Math.floor((width - GAP * (cols - 1)) / cols);

  if (!tab) {
    return (
      <View style={[{ paddingHorizontal: inset }, style]}>
        <AppText variant="bodySm" color="textMuted">
          Daftar episode belum tersedia.
        </AppText>
      </View>
    );
  }

  const numbers: number[] = [];
  for (let n = tab.start; n <= tab.end; n += 1) numbers.push(n);

  return (
    <View style={style}>
      {tabs.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[styles.tabs, { paddingHorizontal: inset }]}
          style={styles.tabsScroll}>
          {tabs.map((t, i) => (
            <Chip
              key={t.label}
              label={t.label}
              selected={i === selectedIndex}
              onPress={() => setTabIndex(i)}
              accessibilityLabel={`Episode ${t.label}`}
            />
          ))}
        </ScrollView>
      )}
      <View style={[styles.grid, { paddingHorizontal: inset, width: width + inset * 2 }]}>
        {numbers.map((n) => (
          <EpisodeTile
            key={n}
            number={n}
            size={tileSize}
            current={n === currentEp}
            watched={!!watched?.[n]}
            locked={locked.has(n)}
            playing={playing}
            tone={tone}
            onPress={onSelect}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tabsScroll: { flexGrow: 0, marginBottom: spacing[3] },
  tabs: { gap: spacing[2] },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
});
