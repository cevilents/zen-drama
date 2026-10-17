import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, spacing } from '@/theme';

export interface DividerProps {
  vertical?: boolean;
  /** Margin on both sides along the cross axis. Default 0. */
  inset?: number;
  /** Margin along the main axis (spacing above/below a horizontal divider). Default spacing[3]. */
  spacingY?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
}

export function Divider({ vertical, inset = 0, spacingY = spacing[3], color = colors.border, style }: DividerProps) {
  return (
    <View
      aria-hidden
      style={[
        vertical
          ? { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', marginVertical: inset, marginHorizontal: spacingY }
          : { height: StyleSheet.hairlineWidth, marginHorizontal: inset, marginVertical: spacingY },
        { backgroundColor: color },
        style,
      ]}
    />
  );
}
