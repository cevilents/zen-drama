import { useEffect, useEffectEvent, useImperativeHandle, useMemo, useRef, useState, type Ref } from 'react';
import {
  FlatList,
  Platform,
  StyleSheet,
  type ListRenderItem,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import type { Drama } from '@/api/types';
import { colors } from '@/theme';

import { FeedEndPage } from './FeedEndPage';
import { FeedItem } from './FeedItem';

type Entry = { kind: 'drama'; key: string; drama: Drama } | { kind: 'more' | 'end'; key: string };

export interface FeedPagerHandle {
  /** Jump back to the first page (tab re-press). */
  scrollToTop: () => void;
}

export interface FeedPagerProps {
  /** Plain ref prop (not forwardRef): React 19.2 never refreshes effect events inside forwardRef. */
  ref?: Ref<FeedPagerHandle>;
  items: Drama[];
  width: number;
  height: number;
  /** Screen is focused (tab visible, nothing pushed on top). */
  focused: boolean;
  /** focused && app foregrounded — gates playback. */
  screenActive: boolean;
  muted: boolean;
  onToggleMute: () => void;
  onAutoplayBlocked: () => void;
  hasMore: boolean;
  fetchingMore: boolean;
  loadMoreError?: unknown;
  onLoadMore: () => void;
  /** Called from the end-of-feed page ("Muat ulang"). */
  onRefresh: () => void;
  bottomSpace: number;
  /** Show "#N Trending" badges on the first pages. */
  ranked?: boolean;
}

/**
 * Web: tween scrollTop with rAF. Chrome cancels native smooth `scrollTo` inside a
 * `scroll-snap-type: mandatory` container, so snapping is suspended for the tween.
 */
function tweenScrollTop(node: HTMLElement, to: number, onDone: () => void, duration = 380): () => void {
  const from = node.scrollTop;
  const delta = to - from;
  if (Math.abs(delta) < 1) {
    onDone();
    return () => {};
  }
  const start = performance.now();
  let frame = 0;
  node.style.scrollSnapType = 'none';
  const finish = () => {
    node.style.scrollSnapType = '';
  };
  const tick = (now: number) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    node.scrollTop = from + delta * eased;
    if (t < 1) frame = requestAnimationFrame(tick);
    else {
      finish();
      onDone();
    }
  };
  frame = requestAnimationFrame(tick);
  return () => {
    cancelAnimationFrame(frame);
    finish();
  };
}

/** How close to a page boundary (fraction of a page) the offset must be to count as "settled". */
const SETTLE = 0.12;
/** Start fetching the next page when this many items remain. */
const PREFETCH_REMAINING = 3;

/**
 * Vertical full-screen pager. One page plays at a time; the next page resolves its episode and
 * buffers in the background. Web gets wheel (one page per gesture) and arrow-key navigation.
 */
export function FeedPager({
  ref,
  items,
  width,
  height,
  focused,
  screenActive,
  muted,
  onToggleMute,
  onAutoplayBlocked,
  hasMore,
  fetchingMore,
  loadMoreError,
  onLoadMore,
  onRefresh,
  bottomSpace,
  ranked,
}: FeedPagerProps) {
  const listRef = useRef<FlatList<Entry>>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const entries = useMemo<Entry[]>(() => {
    const out: Entry[] = items.map((d) => ({ kind: 'drama', key: `${d.source}:${d.id}`, drama: d }));
    if (items.length > 0) out.push({ kind: hasMore ? 'more' : 'end', key: hasMore ? '__more' : '__end' });
    return out;
  }, [items, hasMore]);

  const cancelTween = useRef<(() => void) | null>(null);
  /** Page a programmatic web tween is heading to; pages it passes over must not activate. */
  const targetRef = useRef<number | null>(null);

  const settle = (y: number) => {
    if (height <= 0) return;
    const idx = Math.round(y / height);
    if (targetRef.current != null && idx !== targetRef.current) return;
    if (Math.abs(y - idx * height) > height * SETTLE) return;
    const clamped = Math.max(0, Math.min(entries.length - 1, idx));
    if (clamped !== activeIndex) setActiveIndex(clamped);
  };

  const goTo = (index: number, animated = true) => {
    const target = Math.max(0, Math.min(entries.length - 1, index));
    cancelTween.current?.();
    cancelTween.current = null;
    const node = Platform.OS === 'web' ? (listRef.current?.getScrollableNode?.() as HTMLElement | undefined) : undefined;
    if (node && animated) {
      targetRef.current = target;
      cancelTween.current = tweenScrollTop(node, target * height, () => {
        targetRef.current = null;
        settle(target * height);
      });
      return;
    }
    targetRef.current = null;
    // Long native jumps (tab re-press from deep in the feed) cut instead of sweeping past every page.
    const far = Math.abs(target - activeIndex) > 2;
    listRef.current?.scrollToOffset({ offset: target * height, animated: animated && !far });
  };

  useEffect(() => () => cancelTween.current?.(), []);

  useImperativeHandle(ref, () => ({
    scrollToTop: () => goTo(0),
  }));

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => settle(e.nativeEvent.contentOffset.y);

  // Infinite paging: ask for more while a few pages are still left.
  const requestMore = useEffectEvent(() => {
    if (hasMore && !fetchingMore && !loadMoreError && activeIndex >= items.length - PREFETCH_REMAINING) onLoadMore();
  });
  useEffect(() => {
    requestMore();
  }, [activeIndex, items.length, hasMore, fetchingMore]);

  // Keep the active page aligned when the viewport resizes (web window resize / rotation).
  const realign = useEffectEvent(() => goTo(activeIndex, false));
  useEffect(() => {
    realign();
  }, [height]);

  // --- web: wheel + keyboard paging ------------------------------------------------------
  // Step from the in-flight target so quick repeated presses each advance a page.
  const step = useEffectEvent((dir: 1 | -1) => goTo((targetRef.current ?? activeIndex) + dir));
  const toggleMute = useEffectEvent(() => onToggleMute());

  useEffect(() => {
    if (Platform.OS !== 'web' || !focused || typeof window === 'undefined') return;
    const node = listRef.current?.getScrollableNode?.() as HTMLElement | undefined;

    let lockUntil = 0;
    let acc = 0;
    let lastWheel = 0;
    const onWheel = (e: WheelEvent) => {
      // ctrlKey = trackpad pinch-zoom; leave it to the browser.
      if (e.ctrlKey || Math.abs(e.deltaY) < Math.abs(e.deltaX)) return;
      e.preventDefault();
      const now = Date.now();
      if (now - lastWheel > 200) acc = 0;
      lastWheel = now;
      // Swallow trackpad inertia: each new tick while locked extends the lock slightly.
      if (now < lockUntil) {
        lockUntil = Math.max(lockUntil, now + 180);
        return;
      }
      acc += e.deltaY;
      if (Math.abs(acc) < 24) return;
      step(acc > 0 ? 1 : -1);
      acc = 0;
      lockUntil = now + 520;
    };

    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === 'j') {
        e.preventDefault();
        step(1);
      } else if (e.key === 'ArrowUp' || e.key === 'PageUp' || e.key === 'k') {
        e.preventDefault();
        step(-1);
      } else if (e.key === 'm' || e.key === 'M') {
        toggleMute();
      }
    };

    node?.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKey);
    return () => {
      node?.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKey);
    };
  }, [focused]);

  const renderItem: ListRenderItem<Entry> = ({ item, index }) => {
    if (item.kind !== 'drama') {
      return (
        <FeedEndPage
          height={height}
          bottomSpace={bottomSpace}
          kind={item.kind}
          error={loadMoreError}
          onRetry={item.kind === 'more' ? onLoadMore : onRefresh}
        />
      );
    }
    const active = index === activeIndex;
    // While blurred keep only the current page's player around (paused) to free decoders.
    const preload = active || (focused && index === activeIndex + 1);
    return (
      <FeedItem
        drama={item.drama}
        width={width}
        height={height}
        active={active}
        preload={preload}
        screenActive={screenActive}
        muted={muted}
        onToggleMute={onToggleMute}
        onAutoplayBlocked={onAutoplayBlocked}
        bottomSpace={bottomSpace}
        rankLabel={ranked && index < 20 ? `#${index + 1} Trending` : undefined}
      />
    );
  };

  return (
    <FlatList
      ref={listRef}
      data={entries}
      keyExtractor={(e) => e.key}
      renderItem={renderItem}
      extraData={`${activeIndex}|${focused}|${screenActive}|${muted}|${width}|${height}|${fetchingMore}|${!!loadMoreError}`}
      getItemLayout={(_, index) => ({ length: height, offset: height * index, index })}
      pagingEnabled
      decelerationRate="fast"
      disableIntervalMomentum
      showsVerticalScrollIndicator={false}
      scrollEventThrottle={16}
      onScroll={onScroll}
      onMomentumScrollEnd={onScroll}
      initialNumToRender={1}
      maxToRenderPerBatch={2}
      windowSize={3}
      removeClippedSubviews={Platform.OS !== 'web'}
      style={styles.list}
      accessibilityLabel="Feed cuplikan drama"
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: colors.black },
});
