import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTabBarSpace } from '@/components/navigation/useTabBarSpace';
import { colors } from '@/theme';

export interface ScreenContainerProps {
  children?: ReactNode;
  /** Pad top by the status-bar inset. Default true. */
  safeTop?: boolean;
  /** Pad bottom by the floating tab bar height (tab screens). Default false. */
  tabBarSpace?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * Full-screen dark container. For scrollable screens prefer putting
 * `useTabBarSpace()` into the list's `contentContainerStyle.paddingBottom` instead.
 */
export function ScreenContainer({ children, safeTop = true, tabBarSpace = false, style }: ScreenContainerProps) {
  const insets = useSafeAreaInsets();
  const bottom = useTabBarSpace();
  return (
    <View
      style={[
        styles.root,
        safeTop && { paddingTop: insets.top },
        tabBarSpace && { paddingBottom: bottom },
        style,
      ]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
});
