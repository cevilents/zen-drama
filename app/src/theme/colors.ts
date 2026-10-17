export const colors = {
  bg: '#07070A',
  surface: '#111116',
  surfaceAlt: '#1A1A21',
  elevated: '#22222B',
  border: 'rgba(255,255,255,0.08)',
  borderStrong: 'rgba(255,255,255,0.16)',

  text: '#F6F6F8',
  textSecondary: '#B4B4BE',
  textMuted: '#7C7C88',
  textInverse: '#07070A',

  primary: '#FF2D55',
  primaryAlt: '#FF6A3D',
  primarySoft: 'rgba(255,45,85,0.16)',
  gold: '#F5B841',
  goldSoft: 'rgba(245,184,65,0.16)',
  success: '#30D158',
  successSoft: 'rgba(48,209,88,0.16)',
  danger: '#FF453A',

  white: '#FFFFFF',
  black: '#000000',
  transparent: 'transparent',

  /** Translucent fills used over imagery / video. */
  glass: 'rgba(20,20,26,0.55)',
  glassStrong: 'rgba(14,14,18,0.82)',
  glassBorder: 'rgba(255,255,255,0.12)',

  /** Scrims for legibility over posters and video. */
  scrim: 'rgba(7,7,10,0.6)',
  scrimStrong: 'rgba(7,7,10,0.85)',
  backdrop: 'rgba(0,0,0,0.6)',
} as const;

export type ColorToken = keyof typeof colors;

type GradientStops = readonly [string, string, ...string[]];

export const gradients = {
  primary: ['#FF2D55', '#FF6A3D'],
  gold: ['#FFD27A', '#E09B2D'],
  /** Poster bottom fade for text legibility. */
  posterBottom: ['rgba(7,7,10,0)', 'rgba(7,7,10,0.35)', 'rgba(7,7,10,0.92)'],
  /** Hero banner: fade into page background. */
  heroBottom: ['rgba(7,7,10,0)', 'rgba(7,7,10,0.55)', '#07070A'],
  heroTop: ['rgba(7,7,10,0.7)', 'rgba(7,7,10,0)'],
  /** Full-screen video overlays. */
  videoTop: ['rgba(0,0,0,0.55)', 'rgba(0,0,0,0)'],
  videoBottom: ['rgba(0,0,0,0)', 'rgba(0,0,0,0.35)', 'rgba(0,0,0,0.85)'],
  shimmer: ['rgba(255,255,255,0)', 'rgba(255,255,255,0.07)', 'rgba(255,255,255,0)'],
} as const satisfies Record<string, GradientStops>;

export type GradientToken = keyof typeof gradients;
