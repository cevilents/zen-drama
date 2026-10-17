import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Drama } from '@/api/types';
import { AppText } from '@/components/ui/AppText';
import { IconButton } from '@/components/ui/IconButton';
import { toast, useIsFavorite, useLibrary } from '@/store';
import { colors, layout, motion, spacing, zIndex } from '@/theme';

import { shareDrama } from './share';

export const HEADER_BAR_HEIGHT = 56;

const BUTTON = 40;
const BUTTON_GAP = spacing[2];
/** Keeps the compact title centered between the single back button and the two right buttons. */
const TITLE_INSET = layout.gutter + BUTTON * 2 + BUTTON_GAP * 2;

export interface DetailHeaderProps {
  scrollY: SharedValue<number>;
  /** Undefined while loading or on error: the actions stay visible but disabled. */
  drama?: Drama;
  /** Scroll offsets between which the background and compact title fade in. */
  fadeStart: number;
  fadeEnd: number;
}

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

/** Sticky overlay header: always-visible glass buttons, with a title bar that fades in on scroll. */
export function DetailHeader({ scrollY, drama, fadeStart, fadeEnd }: DetailHeaderProps) {
  const insets = useSafeAreaInsets();
  const isFavorite = useIsFavorite(drama?.source, drama?.id);
  const pop = useSharedValue(1);

  const barStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.get(), [fadeStart, fadeEnd], [0, 1], Extrapolation.CLAMP),
  }));
  const titleStyle = useAnimatedStyle(() => {
    const p = interpolate(scrollY.get(), [fadeStart, fadeEnd], [0, 1], Extrapolation.CLAMP);
    return { opacity: p, transform: [{ translateY: (1 - p) * 6 }] };
  });
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.get() }] }));

  const onToggleFavorite = () => {
    if (!drama) return;
    const added = useLibrary.getState().toggleFavorite(drama);
    pop.set(withSequence(withTiming(1.3, { duration: motion.duration.instant }), withSpring(1, motion.spring.press)));
    if (added) toast.show('Ditambahkan ke Daftarku', { variant: 'favorite' });
    else toast.show('Dihapus dari Daftarku');
  };

  return (
    <View pointerEvents="box-none" style={[styles.root, { height: insets.top + HEADER_BAR_HEIGHT }]}>
      <Animated.View pointerEvents="none" style={[styles.bar, barStyle]} />
      <View pointerEvents="box-none" style={[styles.row, { top: insets.top }]}>
        <Animated.View pointerEvents="none" aria-hidden style={[styles.title, titleStyle]}>
          {!!drama && (
            <AppText variant="title" align="center" numberOfLines={1}>
              {drama.title}
            </AppText>
          )}
        </Animated.View>
        <IconButton icon="chevron-back" accessibilityLabel="Kembali" onPress={goBack} />
        <View style={styles.actions}>
          <Animated.View style={popStyle}>
            <IconButton
              icon={isFavorite ? 'heart' : 'heart-outline'}
              color={isFavorite ? colors.primary : colors.text}
              selected={isFavorite}
              disabled={!drama}
              accessibilityLabel={isFavorite ? 'Hapus dari Daftarku' : 'Tambahkan ke Daftarku'}
              onPress={onToggleFavorite}
            />
          </Animated.View>
          <IconButton
            icon="share-outline"
            disabled={!drama}
            accessibilityLabel="Bagikan drama"
            onPress={() => drama && shareDrama(drama)}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: zIndex.raised },
  bar: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(7,7,10,0.92)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  row: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: HEADER_BAR_HEIGHT,
    width: '100%',
    maxWidth: layout.maxContentWidth,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: layout.gutter,
  },
  title: { position: 'absolute', left: TITLE_INSET, right: TITLE_INSET, justifyContent: 'center' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: BUTTON_GAP },
});
