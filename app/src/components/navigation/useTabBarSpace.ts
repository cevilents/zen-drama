import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { layout, spacing } from '@/theme';

/**
 * Vertical space covered by the floating tab bar (bar + offset + bottom inset).
 * Use as `paddingBottom` on scroll content in tab screens so the last row isn't hidden.
 */
export function useTabBarSpace(extra: number = spacing[4]): number {
  const insets = useSafeAreaInsets();
  return layout.tabBarHeight + Math.max(insets.bottom, layout.tabBarInset) + extra;
}
