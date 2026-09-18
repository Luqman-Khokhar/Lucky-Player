/**
 * Design tokens for the app: colors, type, spacing, radii and elevation.
 *
 * Colors come in two sets. The `light`/`dark` keys follow the system theme and are used by every
 * ordinary screen. The `player*` keys are fixed across both themes because they sit on top of video,
 * which is always dark.
 */

import '@/global.css';

import { Platform } from 'react-native';

/** Controls that sit over video keep the same look in both themes. */
const player = {
  playerBackground: '#000000',
  playerOverlay: 'rgba(0, 0, 0, 0.6)',
  playerText: '#FFFFFF',
  playerTrack: 'rgba(255, 255, 255, 0.28)',
  playerTextSecondary: 'rgba(255, 255, 255, 0.72)',
  playerScrim: 'rgba(24, 19, 15, 0.62)',
  playerSheet: 'rgba(28, 23, 19, 0.97)',
  playerDivider: 'rgba(255, 255, 255, 0.12)',
  playerPressed: 'rgba(255, 255, 255, 0.18)',
  playerBackdrop: 'rgba(0, 0, 0, 0.55)',
  playerAccent: '#FB923C',
} as const;

/** The splash icon's tile, kept here so the app has one source for its colors. */
export const BrandGradient = ['#F59E0B', '#D2570E'] as const;

export const Colors = {
  light: {
    text: '#1B1613',
    /** Warm paper rather than white, so a bright room is easier on the eyes. */
    background: '#F6F2EC',
    /** Cards, fields and other raised blocks sit above the page, so they are lighter. */
    backgroundElement: '#FFFCF7',
    backgroundSelected: '#EAE2D6',
    textSecondary: '#5C534B',
    /** Third level of text: timestamps, counts, hints. */
    textTertiary: '#7A7168',
    accent: '#C2410C',
    onAccent: '#FFFFFF',
    /** Tinted background for a selected or highlighted row. */
    accentSoft: 'rgba(194, 65, 12, 0.12)',
    /** Accent tuned for text and icons rather than fills. */
    accentText: '#9A3412',
    danger: '#BE123C',
    dangerSoft: 'rgba(190, 18, 60, 0.12)',
    success: '#15803D',
    warning: '#A16207',
    /** Hairline between rows and around cards. */
    border: '#E3DACC',
    borderStrong: '#CBBFAD',
    /** Dim layer behind sheets and dialogs. */
    overlay: 'rgba(27, 22, 19, 0.45)',
    shadow: '#1B1613',
    ...player,
  },
  dark: {
    text: '#F5F0EA',
    /** Warm charcoal rather than a blue-black, to match the light theme's paper. */
    background: '#131110',
    backgroundElement: '#1F1B19',
    backgroundSelected: '#302A26',
    textSecondary: '#A9A09A',
    textTertiary: '#8B827A',
    accent: '#F97316',
    /** Dark ink on the bright accent; white would not carry enough contrast on orange. */
    onAccent: '#1B1210',
    accentSoft: 'rgba(249, 115, 22, 0.18)',
    accentText: '#FDBA74',
    danger: '#FB7185',
    dangerSoft: 'rgba(251, 113, 133, 0.18)',
    success: '#4ADE80',
    warning: '#FBBF24',
    border: '#2B2522',
    borderStrong: '#3E3733',
    overlay: 'rgba(0, 0, 0, 0.6)',
    shadow: '#000000',
    ...player,
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

/** Corner radii. `pill` is a large number so a shape rounds to its own height. */
export const Radius = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  pill: 999,
} as const;

/** Soft shadows for raised surfaces. Android only reads `elevation`, so both are set. */
export const Elevation = {
  low: {
    elevation: 2,
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  medium: {
    elevation: 6,
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
  },
  high: {
    elevation: 12,
    shadowOpacity: 0.24,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
  },
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
