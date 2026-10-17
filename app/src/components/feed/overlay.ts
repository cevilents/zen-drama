import type { TextStyle } from 'react-native';

import { colors } from '@/theme';

/**
 * Colours for chrome drawn directly over video frames. They are deliberately
 * white-alpha (not surface tokens) so they read on any frame, bright or dark.
 */
export const onVideo = {
  text: colors.white,
  textDim: 'rgba(255,255,255,0.72)',
  textFaint: 'rgba(255,255,255,0.5)',
  track: 'rgba(255,255,255,0.18)',
  chip: 'rgba(255,255,255,0.14)',
  chipBorder: 'rgba(255,255,255,0.18)',
} as const;

/** Soft drop shadow so overlay text and glyphs survive bright frames. */
export const videoTextShadow: TextStyle = {
  textShadowColor: 'rgba(0,0,0,0.55)',
  textShadowRadius: 8,
  textShadowOffset: { width: 0, height: 1 },
};

export type FeedMode = 'foryou' | 'trending';
