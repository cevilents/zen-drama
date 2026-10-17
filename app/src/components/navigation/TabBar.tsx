import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { useEffect, useState } from 'react';
import { Keyboard, Platform, Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { GlassView } from '@/components/ui/GlassView';
import type { IoniconName } from '@/components/ui/IconButton';
import { haptics } from '@/lib/haptics';
import { colors, layout, motion, radii, shadows, spacing } from '@/theme';

export interface TabMeta {
  label: string;
  icon: IoniconName;
  iconActive: IoniconName;
}

/** Route name → label/icons. Order follows the <Tabs.Screen> order in (tabs)/_layout. */
export const TAB_META: Record<string, TabMeta> = {
  index: { label: 'Beranda', icon: 'home-outline', iconActive: 'home' },
  discover: { label: 'Untukmu', icon: 'play-circle-outline', iconActive: 'play-circle' },
  search: { label: 'Cari', icon: 'search-outline', iconActive: 'search' },
  library: { label: 'Daftarku', icon: 'bookmark-outline', iconActive: 'bookmark' },
  profile: { label: 'Pengaturan', icon: 'settings-outline', iconActive: 'settings' },
};

/** Routes where the bar floats transparently over full-bleed video. */
const IMMERSIVE_ROUTES = new Set(['discover']);

const INDICATOR_W = 52;
const INDICATOR_H = 32;

/**
 * Floating glass pill tab bar with a sliding highlight capsule.
 * On the "Untukmu" video feed it switches to a transparent, scrim-backed variant.
 */
export function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const [barWidth, setBarWidth] = useState(0);
  // Android resizes the window for the keyboard, which would float the bar on top of it.
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const subs = [
      Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true)),
      Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false)),
    ];
    return () => subs.forEach((s) => s.remove());
  }, []);

  const routes = state.routes.filter((r) => TAB_META[r.name]);
  const activeName = state.routes[state.index]?.name;
  const activeIdx = Math.max(0, routes.findIndex((r) => r.name === activeName));
  const immersive = IMMERSIVE_ROUTES.has(activeName ?? '');
  const itemW = routes.length ? barWidth / routes.length : 0;

  const indicatorStyle = useAnimatedStyle(() => ({
    opacity: withTiming(barWidth > 0 ? 1 : 0, { duration: motion.duration.fast }),
    transform: [{ translateX: withSpring(activeIdx * itemW + (itemW - INDICATOR_W) / 2, motion.spring.gentle) }],
  }));

  const onLayout = (e: LayoutChangeEvent) => setBarWidth(e.nativeEvent.layout.width);
  const bottom = Math.max(insets.bottom, layout.tabBarInset);

  if (keyboardVisible) return null;

  const items = (
    <View style={styles.row} onLayout={onLayout}>
      <Animated.View pointerEvents="none" style={[styles.indicator, immersive && styles.indicatorImmersive, indicatorStyle]}>
        {!immersive && (
          <LinearGradient
            colors={['rgba(255,45,85,0.22)', 'rgba(255,106,61,0.12)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        )}
      </Animated.View>

      {routes.map((route) => {
        const meta = TAB_META[route.name];
        const focused = route.name === activeName;
        const tint = focused ? (immersive ? colors.white : colors.primary) : immersive ? 'rgba(255,255,255,0.72)' : colors.textMuted;

        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) {
            haptics.selection();
            navigation.navigate(route.name, route.params);
          }
        };
        const onLongPress = () => navigation.emit({ type: 'tabLongPress', target: route.key });

        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            onLongPress={onLongPress}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={meta.label}
            style={styles.item}>
            <Ionicons name={focused ? meta.iconActive : meta.icon} size={23} color={tint} />
            <AppText
              variant="caption"
              weight={focused ? 'bold' : 'medium'}
              color={tint}
              numberOfLines={1}
              style={[styles.label, immersive && styles.labelShadow]}>
              {meta.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <View pointerEvents="box-none" style={[styles.host, { paddingBottom: bottom }]}>
      {immersive && (
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.55)']}
          style={[StyleSheet.absoluteFill, styles.scrim]}
        />
      )}
      {immersive ? (
        <View style={styles.bar}>{items}</View>
      ) : (
        <View style={[styles.barShadow, shadows.lg]}>
          <GlassView style={[styles.bar, styles.glass]} intensity={60} tint="rgba(17,17,22,0.72)">
            {items}
          </GlassView>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: layout.gutter,
    alignItems: 'center',
  },
  scrim: { top: -24 },
  barShadow: { width: '100%', maxWidth: 520, borderRadius: radii.pill },
  bar: {
    width: '100%',
    maxWidth: 520,
    height: layout.tabBarHeight,
    borderRadius: radii.pill,
    paddingHorizontal: spacing[1.5],
    justifyContent: 'center',
  },
  glass: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassBorder,
  },
  row: { flexDirection: 'row', alignItems: 'center', height: '100%' },
  item: {
    flex: 1,
    height: '100%',
    minHeight: layout.minTapTarget,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  label: { fontSize: 10.5, lineHeight: 13 },
  labelShadow: {
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 6,
    textShadowOffset: { width: 0, height: 1 },
  },
  indicator: {
    position: 'absolute',
    left: 0,
    top: (layout.tabBarHeight - INDICATOR_H) / 2 - 8,
    width: INDICATOR_W,
    height: INDICATOR_H,
    borderRadius: radii.pill,
    overflow: 'hidden',
  },
  indicatorImmersive: { backgroundColor: 'transparent' },
});
