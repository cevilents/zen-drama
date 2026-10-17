import { colors, gradients } from './colors';
import { layout, motion, radii, shadows, spacing, zIndex } from './tokens';
import { fonts, typography } from './typography';

export const theme = {
  colors,
  gradients,
  spacing,
  radii,
  layout,
  shadows,
  motion,
  zIndex,
  fonts,
  typography,
} as const;

export type Theme = typeof theme;

export { colors, gradients, spacing, radii, layout, shadows, motion, zIndex, fonts, typography };
export type { ColorToken, GradientToken } from './colors';
export type { TypographyVariant, FontWeightToken } from './typography';
