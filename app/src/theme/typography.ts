import type { TextStyle } from 'react-native';

/**
 * Font family names as registered in `useFonts` (see src/app/_layout.tsx).
 * Each weight is its own family so it renders identically on iOS, Android and web.
 */
export const fonts = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  extrabold: 'PlusJakartaSans_800ExtraBold',
} as const;

export type FontWeightToken = keyof typeof fonts;

function preset(
  family: string,
  fontSize: number,
  lineHeight: number,
  letterSpacing = 0,
  extra?: TextStyle,
): TextStyle {
  return { fontFamily: family, fontSize, lineHeight, letterSpacing, ...extra };
}

export const typography = {
  /** Hero titles, splash moments. */
  display: preset(fonts.extrabold, 34, 38, -0.9),
  h1: preset(fonts.extrabold, 28, 32, -0.6),
  h2: preset(fonts.bold, 22, 27, -0.4),
  h3: preset(fonts.bold, 18, 23, -0.25),
  /** Card / list item titles. */
  title: preset(fonts.semibold, 15, 20, -0.1),
  body: preset(fonts.regular, 15, 22),
  bodyMedium: preset(fonts.medium, 15, 22),
  bodySm: preset(fonts.regular, 13, 18),
  label: preset(fonts.semibold, 13, 16, 0),
  caption: preset(fonts.medium, 11, 14, 0.1),
  overline: preset(fonts.bold, 11, 14, 1.2, { textTransform: 'uppercase' }),
  /** Giant outlined rank numerals (Top 10). */
  rank: preset(fonts.extrabold, 96, 96, -6),
} as const;

export type TypographyVariant = keyof typeof typography;
