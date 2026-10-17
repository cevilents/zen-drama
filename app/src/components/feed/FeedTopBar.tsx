import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, withSpring, withTiming } from 'react-native-reanimated';

import { AppText } from '@/components/ui/AppText';
import { PressableScale } from '@/components/ui/PressableScale';
import { haptics } from '@/lib/haptics';
import { layout, motion, radii, spacing } from '@/theme';

import { onVideo, videoTextShadow, type FeedMode } from './overlay';

const TABS: { key: FeedMode; label: string }[] = [
  { key: 'foryou', label: 'Untukmu' },
  { key: 'trending', label: 'Trending' },
];

const UNDERLINE_W = 18;

export interface FeedTopBarProps {
  mode: FeedMode;
  onChange: (mode: FeedMode) => void;
  onSearch: () => void;
  /** Safe-area top inset. */
  top: number;
}

/** Centered "Untukmu | Trending" text tabs with a sliding underline, plus a search shortcut. */
export function FeedTopBar({ mode, onChange, onSearch, top }: FeedTopBarProps) {
  const [tabX, setTabX] = useState<Record<FeedMode, { x: number; w: number }>>({
    foryou: { x: 0, w: 0 },
    trending: { x: 0, w: 0 },
  });
  const active = tabX[mode];
  const measured = active.w > 0;

  const underlineStyle = useAnimatedStyle(() => ({
    opacity: withTiming(measured ? 1 : 0, { duration: motion.duration.fast }),
    transform: [{ translateX: withSpring(active.x + (active.w - UNDERLINE_W) / 2, motion.spring.gentle) }],
  }));

  const onTabLayout = (key: FeedMode) => (e: LayoutChangeEvent) => {
    const { x, width } = e.nativeEvent.layout;
    setTabX((prev) => (prev[key].x === x && prev[key].w === width ? prev : { ...prev, [key]: { x, w: width } }));
  };

  return (
    <View pointerEvents="box-none" style={[styles.host, { paddingTop: top + spacing[1.5] }]}>
      <View style={styles.side} />
      <View style={styles.tabs} accessibilityRole="tablist">
        {TABS.map((t) => {
          const focused = t.key === mode;
          return (
            <Pressable
              key={t.key}
              onLayout={onTabLayout(t.key)}
              onPress={() => {
                if (focused) return;
                haptics.selection();
                onChange(t.key);
              }}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={t.label}
              hitSlop={{ top: 8, bottom: 8 }}
              style={styles.tab}>
              <AppText
                variant="h3"
                weight={focused ? 'extrabold' : 'semibold'}
                color={focused ? onVideo.text : onVideo.textDim}
                style={[styles.tabText, videoTextShadow]}>
                {t.label}
              </AppText>
            </Pressable>
          );
        })}
        <Animated.View pointerEvents="none" style={[styles.underline, underlineStyle]} />
      </View>
      <View style={[styles.side, styles.right]}>
        <PressableScale
          onPress={onSearch}
          haptic="light"
          activeScale={0.88}
          accessibilityLabel="Cari drama"
          hitSlop={6}
          style={styles.search}>
          <Ionicons name="search" size={24} color={onVideo.text} style={videoTextShadow} />
        </PressableScale>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: layout.gutter - spacing[1],
  },
  side: { width: layout.minTapTarget, height: layout.minTapTarget },
  right: { alignItems: 'flex-end', justifyContent: 'center' },
  tabs: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing[5],
    height: layout.minTapTarget,
  },
  tab: { height: layout.minTapTarget, justifyContent: 'center', paddingHorizontal: spacing[1] },
  tabText: { fontSize: 17, lineHeight: 22, letterSpacing: -0.2 },
  underline: {
    position: 'absolute',
    left: 0,
    bottom: 4,
    width: UNDERLINE_W,
    height: 3,
    borderRadius: radii.pill,
    backgroundColor: onVideo.text,
  },
  search: {
    width: layout.minTapTarget,
    height: layout.minTapTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
