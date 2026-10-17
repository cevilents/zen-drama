import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { memo, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import type { Drama } from '@/api/types';
import { AppText } from '@/components/ui/AppText';
import { GradientButton } from '@/components/ui/GradientButton';
import type { IoniconName } from '@/components/ui/IconButton';
import { PressableScale } from '@/components/ui/PressableScale';
import { useHistoryEntry } from '@/store/useHistory';
import { useIsFavorite } from '@/store/useLibrary';
import { colors, gradients, layout, radii, spacing } from '@/theme';

import { openDetail, playDrama, toggleFavorite } from './dramaActions';
import { storyTags } from './meta';

const AUTO_ADVANCE_MS = 6000;
/** Wide banners are ~3:1 key art with the cast right of centre. */
const BANNER_ASPECT = 3;
const BANNER_FOCUS_X = 0.62;

export interface HeroCarouselProps {
  items: Drama[];
  width: number;
  height: number;
  /** Vertical scroll of the page, for the image parallax. */
  scrollY: SharedValue<number>;
  /** False while the screen is blurred: pauses auto-advance. */
  active?: boolean;
  onLongPress?: (drama: Drama) => void;
}

export function HeroCarousel({ items, width, height, scrollY, active = true, onLongPress }: HeroCarouselProps) {
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const scrollX = useSharedValue(0);
  const lastIndex = useSharedValue(0);
  const [index, setIndex] = useState(0);
  const [dragging, setDragging] = useState(false);
  const count = items.length;
  const current = Math.min(index, Math.max(0, count - 1));
  // Mount artwork lazily (current ± 1, then keep): the first slide's banner must not queue
  // behind seven other 1920px banners on the same image host.
  const [reach, setReach] = useState(1);
  if (current + 1 > reach) setReach(current + 1);

  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollX.set(e.contentOffset.x);
      const i = Math.min(count - 1, Math.max(0, Math.round(e.contentOffset.x / Math.max(1, width))));
      if (i !== lastIndex.get()) {
        lastIndex.set(i);
        scheduleOnRN(setIndex, i);
      }
    },
    onBeginDrag: () => {
      scheduleOnRN(setDragging, true);
    },
    onEndDrag: () => {
      scheduleOnRN(setDragging, false);
    },
  });

  // Auto-advance; the timer restarts whenever the page changes, so a manual swipe buys a full interval.
  useEffect(() => {
    if (!active || dragging || count < 2) return;
    const t = setTimeout(() => {
      const next = (current + 1) % count;
      scrollRef.current?.scrollTo({ x: next * width, animated: true });
    }, AUTO_ADVANCE_MS);
    return () => clearTimeout(t);
  }, [active, dragging, current, count, width, scrollRef]);

  // Keep the visible page aligned when the window width changes (web resize / rotation).
  useEffect(() => {
    scrollRef.current?.scrollTo({ x: lastIndex.get() * width, animated: false });
  }, [width, scrollRef, lastIndex]);

  return (
    <View
      style={{ height }}
      onTouchStart={() => setDragging(true)}
      onTouchEnd={() => setDragging(false)}
      onTouchCancel={() => setDragging(false)}>
      <Animated.ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={onScroll}
        accessibilityRole="adjustable"
        accessibilityLabel={`Sorotan, ${current + 1} dari ${count}`}>
        {items.map((drama, i) => (
          <HeroSlide
            key={`${drama.source}:${drama.id}`}
            drama={drama}
            index={i}
            current={i === current}
            loadArt={i <= reach || i === count - 1}
            width={width}
            height={height}
            scrollX={scrollX}
            scrollY={scrollY}
            onLongPress={onLongPress}
          />
        ))}
      </Animated.ScrollView>

      {count > 1 && (
        <View style={styles.dots} pointerEvents="none" aria-hidden>
          {items.map((d, i) => (
            <PageDot key={`${d.source}:${d.id}`} index={i} width={width} scrollX={scrollX} />
          ))}
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Slide
// ---------------------------------------------------------------------------

interface HeroSlideProps {
  drama: Drama;
  index: number;
  /** Visible page; off-screen slides are hidden from screen readers. */
  current: boolean;
  /** Render the artwork (false = placeholder until the slide is near). */
  loadArt: boolean;
  width: number;
  height: number;
  scrollX: SharedValue<number>;
  scrollY: SharedValue<number>;
  onLongPress?: (drama: Drama) => void;
}

const HeroSlide = memo(function HeroSlide({ drama, index, current, loadArt, width, height, scrollX, scrollY, onLongPress }: HeroSlideProps) {
  const entry = useHistoryEntry(drama.source, drama.id);
  const favorite = useIsFavorite(drama.source, drama.id);
  const priority = index === 0 ? 'high' : 'normal';

  const banner = drama.banner || null;
  const artH = banner ? Math.max(height * 0.66, width / BANNER_ASPECT) : height;
  const artW = banner ? artH * BANNER_ASPECT : width;
  const artLeft = banner ? Math.min(0, Math.max(width - artW, width / 2 - artW * BANNER_FOCUS_X)) : 0;

  const artStyle = useAnimatedStyle(() => {
    const dx = scrollX.get() - index * width;
    const y = scrollY.get();
    return {
      transform: [
        { translateX: dx * 0.45 },
        { translateY: y > 0 ? y * 0.38 : 0 },
        { scale: interpolate(Math.abs(dx), [0, width], [1, 1.08], Extrapolation.CLAMP) },
      ],
    };
  });

  const contentStyle = useAnimatedStyle(() => {
    const dx = scrollX.get() - index * width;
    return {
      opacity: interpolate(Math.abs(dx), [0, width * 0.55], [1, 0], Extrapolation.CLAMP),
      transform: [{ translateX: dx * 0.22 }],
    };
  });

  const tags = storyTags(drama, 2);
  const meta: string[] = [...tags];
  if (drama.totalEpisodes > 0) meta.push(`${drama.totalEpisodes} EP`);
  if (drama.isCompleted) meta.push('Tamat');

  const playLabel = entry ? `Lanjut EP ${entry.lastEpisode}` : 'Tonton';

  return (
    <View style={[styles.slide, { width, height }]} aria-hidden={!current}>
      <Animated.View style={[StyleSheet.absoluteFill, artStyle]}>
        {!loadArt ? null : banner ? (
          <>
            {/* Ambient fill: the wide art blurred to cover the tall frame. */}
            <Image
              source={{ uri: banner }}
              style={[StyleSheet.absoluteFill, styles.ambient]}
              contentFit="cover"
              blurRadius={26}
              priority="low"
              cachePolicy="memory-disk"
              transition={300}
            />
            <View style={{ position: 'absolute', top: 0, left: artLeft, width: artW, height: artH }}>
              <Image
                source={{ uri: banner }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                priority={priority}
                cachePolicy="memory-disk"
                transition={300}
                accessible
                accessibilityLabel={drama.title}
              />
            </View>
            <LinearGradient
              colors={['rgba(7,7,10,0)', 'rgba(7,7,10,0.5)']}
              style={[styles.artFade, { top: artH * 0.55, height: artH * 0.45 }]}
            />
          </>
        ) : (
          <Image
            source={{ uri: drama.cover }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            contentPosition="top"
            priority={priority}
            cachePolicy="memory-disk"
            transition={300}
            accessible
            accessibilityLabel={drama.title}
          />
        )}
      </Animated.View>

      <LinearGradient
        colors={gradients.heroBottom}
        locations={[0.3, 0.6, 0.94]}
        style={styles.bottomFade}
        pointerEvents="none"
      />
      <LinearGradient
        colors={['rgba(7,7,10,0.45)', 'rgba(7,7,10,0)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.7, y: 0 }}
        style={[StyleSheet.absoluteFill, styles.sideScrim]}
        pointerEvents="none"
      />

      {/* Tap anywhere on the art → detail. Sibling (not parent) of the buttons: no nested pressables on web. */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={() => openDetail(drama)}
        onLongPress={onLongPress ? () => onLongPress(drama) : undefined}
        accessibilityRole="button"
        accessibilityLabel={`Buka detail ${drama.title}`}
      />

      <Animated.View style={[styles.content, contentStyle]} pointerEvents="box-none">
        <View pointerEvents="none">
          <View style={styles.overline}>
            <Ionicons name="sparkles" size={12} color={colors.gold} />
            <AppText variant="overline" color="gold">
              Sorotan Hari Ini
            </AppText>
          </View>
          <AppText variant="display" numberOfLines={2} style={styles.title}>
            {drama.title}
          </AppText>
          {meta.length > 0 && (
            <View style={styles.metaRow}>
              {meta.map((m, i) => (
                <View key={`${m}-${i}`} style={styles.metaItem}>
                  {i > 0 && <View style={styles.metaDot} />}
                  <AppText
                    variant="label"
                    color={i === tags.length ? 'text' : 'textSecondary'}
                    weight={i === tags.length ? 'bold' : 'semibold'}
                    numberOfLines={1}>
                    {m}
                  </AppText>
                </View>
              ))}
            </View>
          )}
          {!!drama.description && (
            <AppText variant="bodySm" color="textSecondary" numberOfLines={2} style={styles.synopsis}>
              {drama.description}
            </AppText>
          )}
        </View>

        <View style={styles.actions}>
          <HeroAction
            icon={favorite ? 'checkmark' : 'add'}
            label="Daftarku"
            active={favorite}
            accessibilityLabel={favorite ? `Hapus ${drama.title} dari Daftarku` : `Tambah ${drama.title} ke Daftarku`}
            onPress={() => toggleFavorite(drama)}
          />
          <GradientButton
            label={playLabel}
            icon="play"
            onPress={() => playDrama(drama)}
            accessibilityLabel={`${playLabel} ${drama.title}`}
            style={styles.play}
          />
          <HeroAction
            icon="information-circle-outline"
            label="Info"
            accessibilityLabel={`Info ${drama.title}`}
            onPress={() => openDetail(drama)}
          />
        </View>
      </Animated.View>
    </View>
  );
});

interface HeroActionProps {
  icon: IoniconName;
  label: string;
  active?: boolean;
  onPress: () => void;
  accessibilityLabel: string;
}

function HeroAction({ icon, label, active, onPress, accessibilityLabel }: HeroActionProps) {
  return (
    <PressableScale
      onPress={onPress}
      haptic="light"
      activeScale={0.9}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: !!active }}
      style={styles.heroAction}>
      <View style={[styles.heroActionIcon, active && styles.heroActionIconActive]}>
        <Ionicons name={icon} size={22} color={active ? colors.primary : colors.text} />
      </View>
      <AppText variant="caption" color={active ? 'text' : 'textSecondary'} weight="semibold">
        {label}
      </AppText>
    </PressableScale>
  );
}

// ---------------------------------------------------------------------------
// Page indicator
// ---------------------------------------------------------------------------

const DOT = 6;
const DOT_ACTIVE = 22;

function PageDot({ index, width, scrollX }: { index: number; width: number; scrollX: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const d = Math.min(1, Math.abs(scrollX.get() / Math.max(1, width) - index));
    return {
      width: DOT + (DOT_ACTIVE - DOT) * (1 - d),
      opacity: 0.35 + 0.65 * (1 - d),
    };
  });
  return <Animated.View style={[styles.dot, style]} />;
}

const styles = StyleSheet.create({
  slide: { overflow: 'hidden', backgroundColor: colors.bg },
  bottomFade: { position: 'absolute', top: 0, left: 0, right: 0, bottom: -2 },
  ambient: { opacity: 0.85, transform: [{ scale: 1.25 }] },
  artFade: { position: 'absolute', left: 0, right: 0 },
  sideScrim: { right: '30%' },
  content: {
    position: 'absolute',
    left: layout.gutter,
    right: layout.gutter,
    bottom: spacing[8],
  },
  overline: { flexDirection: 'row', alignItems: 'center', gap: spacing[1.5], marginBottom: spacing[2] },
  title: {
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowRadius: 12,
    textShadowOffset: { width: 0, height: 2 },
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginTop: spacing[2.5] },
  metaItem: { flexDirection: 'row', alignItems: 'center' },
  metaDot: {
    width: 4,
    height: 4,
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
    marginHorizontal: spacing[2],
  },
  synopsis: { marginTop: spacing[2], maxWidth: 520 },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing[5],
    gap: spacing[2],
  },
  play: { flex: 1, maxWidth: 240 },
  heroAction: { width: 64, alignItems: 'center', gap: spacing[1] },
  heroActionIcon: {
    width: 34,
    height: 34,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroActionIconActive: { backgroundColor: colors.primarySoft },
  dots: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: spacing[2],
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing[1.5],
  },
  dot: { height: DOT, borderRadius: radii.pill, backgroundColor: colors.text },
});
