import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, useWindowDimensions, View, type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { colors, layout, motion, radii, spacing } from '@/theme';

import { AppText } from './AppText';
import { IconButton } from './IconButton';

export interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  /** Right side of the header (e.g. a "Reset" link). */
  headerRight?: ReactNode;
  children?: ReactNode;
  /** Max height as fraction of screen height. Default 0.85. */
  maxHeightRatio?: number;
  /** Fixed height as fraction of screen height (e.g. 0.6 for episode pickers). */
  heightRatio?: number;
  /** Swipe-down / backdrop tap closes. Default true. */
  dismissible?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
}

/**
 * Modal slide-up sheet with backdrop fade and drag-to-dismiss on the grabber/header.
 * Works on iOS, Android and web. Children can include a ScrollView/FlatList (give it flex: 1
 * and pass `heightRatio` so it has a bounded height).
 */
export function BottomSheet({
  visible,
  onClose,
  title,
  headerRight,
  children,
  maxHeightRatio = 0.85,
  heightRatio,
  dismissible = true,
  contentStyle,
}: BottomSheetProps) {
  const { height: screenH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(visible);
  // Mount synchronously when opened; unmount only after the exit animation finishes.
  if (visible && !mounted) setMounted(true);
  const translateY = useSharedValue(screenH);
  const backdrop = useSharedValue(0);
  // Latest `visible`, read when the exit animation's completion lands on the JS thread.
  const visibleRef = useRef(visible);
  // True once the sheet has fully slid out and unmounted (start position for the next open).
  const closedRef = useRef(true);

  // A reopen can race the exit animation's completion: only unmount if still hidden.
  const unmountIfHidden = () => {
    if (visibleRef.current) return;
    closedRef.current = true;
    setMounted(false);
  };

  useEffect(() => {
    visibleRef.current = visible;
    if (visible) {
      // Reopened mid-close: spring back from where it is instead of jumping off-screen.
      if (closedRef.current) translateY.set(screenH);
      closedRef.current = false;
      backdrop.set(withTiming(1, { duration: motion.duration.normal }));
      translateY.set(withSpring(0, motion.spring.sheet));
    } else {
      backdrop.set(withTiming(0, { duration: motion.duration.fast }));
      translateY.set(
        withTiming(screenH, { duration: motion.duration.normal, easing: Easing.in(Easing.cubic) }, (finished) => {
          if (finished) scheduleOnRN(unmountIfHidden);
        }),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const pan = Gesture.Pan()
    .enabled(dismissible)
    .onUpdate((e) => {
      translateY.set(Math.max(0, e.translationY));
    })
    .onEnd((e) => {
      if (e.translationY > 120 || e.velocityY > 900) {
        scheduleOnRN(onClose);
      } else {
        translateY.set(withSpring(0, motion.spring.sheet));
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.get() }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.get() }));

  if (!mounted) return null;

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <GestureHandlerRootView style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={dismissible ? onClose : undefined}
            accessibilityRole="button"
            accessibilityLabel="Tutup"
          />
        </Animated.View>

        <Animated.View
          accessibilityViewIsModal
          style={[
            styles.sheet,
            {
              paddingBottom: Math.max(insets.bottom, spacing[4]),
              maxHeight: screenH * maxHeightRatio,
              height: heightRatio ? screenH * heightRatio : undefined,
            },
            sheetStyle,
          ]}>
          <GestureDetector gesture={pan}>
            <View style={styles.header}>
              <View style={styles.grabber} />
              {(title || headerRight) && (
                <View style={styles.titleRow}>
                  <AppText variant="h3" style={styles.title} numberOfLines={1} accessibilityRole="header">
                    {title}
                  </AppText>
                  {headerRight}
                  <IconButton icon="close" variant="solid" size={32} accessibilityLabel="Tutup" onPress={onClose} />
                </View>
              )}
            </View>
          </GestureDetector>
          <View style={[styles.content, heightRatio ? styles.flex : null, contentStyle]}>{children}</View>
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  flex: { flex: 1 },
  backdrop: { backgroundColor: colors.backdrop },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: 0,
    borderColor: colors.borderStrong,
    width: '100%',
    maxWidth: layout.maxContentWidth,
    alignSelf: 'center',
  },
  header: { paddingTop: spacing[2], paddingHorizontal: layout.gutter },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: radii.pill,
    backgroundColor: colors.borderStrong,
    marginBottom: spacing[2],
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], paddingBottom: spacing[3] },
  title: { flex: 1 },
  content: { paddingHorizontal: layout.gutter },
});
