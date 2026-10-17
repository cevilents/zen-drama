import { forwardRef } from 'react';
import { Text as RNText, type TextProps, type TextStyle } from 'react-native';

import { colors, fonts, typography, type ColorToken, type FontWeightToken, type TypographyVariant } from '@/theme';

export interface AppTextProps extends TextProps {
  /** Typography preset. Default "body". */
  variant?: TypographyVariant;
  /** Theme color token or any raw color string. Default "text". */
  color?: ColorToken | (string & {});
  /** Override the preset weight. */
  weight?: FontWeightToken;
  align?: TextStyle['textAlign'];
  /** Tabular numerals (timers, counters). */
  tabular?: boolean;
}

function resolveColor(c: AppTextProps['color']): string {
  if (!c) return colors.text;
  return (colors as Record<string, string>)[c] ?? c;
}

export const AppText = forwardRef<RNText, AppTextProps>(function AppText(
  { variant = 'body', color, weight, align, tabular, style, ...rest },
  ref,
) {
  return (
    <RNText
      ref={ref}
      // Prevent iOS accessibility scaling from blowing up dense layouts; still allow some scaling.
      maxFontSizeMultiplier={1.4}
      {...rest}
      style={[
        typography[variant],
        { color: resolveColor(color) },
        weight && { fontFamily: fonts[weight] },
        align && { textAlign: align },
        tabular && { fontVariant: ['tabular-nums'] },
        style,
      ]}
    />
  );
});

/** Alias so screens can `import { Text } from '@/components/ui'`. */
export const Text = AppText;
