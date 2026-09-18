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

/** The colors an accent replaces. Everything else in a theme stays put. */
type AccentColors = {
  accent: string;
  onAccent: string;
  accentSoft: string;
  accentText: string;
  playerAccent: string;
};

/**
 * Accents the user can pick in Appearance. Each one carries a light and a dark version, because a color
 * that reads well on paper is rarely the one that reads well on charcoal: the light version is deep
 * enough to carry white text, the dark version bright enough to stand out with dark text on it.
 */
export const Accents = {
  ember: {
    label: 'Ember',
    light: {
      accent: '#C2410C',
      onAccent: '#FFFFFF',
      accentSoft: 'rgba(194, 65, 12, 0.12)',
      accentText: '#9A3412',
      playerAccent: '#FB923C',
    },
    dark: {
      accent: '#F97316',
      onAccent: '#1B1210',
      accentSoft: 'rgba(249, 115, 22, 0.18)',
      accentText: '#FDBA74',
      playerAccent: '#FB923C',
    },
  },
  amber: {
    label: 'Amber',
    light: {
      accent: '#A16207',
      onAccent: '#FFFFFF',
      accentSoft: 'rgba(161, 98, 7, 0.14)',
      accentText: '#854D0E',
      playerAccent: '#FCD34D',
    },
    dark: {
      accent: '#FBBF24',
      onAccent: '#1B1508',
      accentSoft: 'rgba(251, 191, 36, 0.18)',
      accentText: '#FCD34D',
      playerAccent: '#FCD34D',
    },
  },
  rose: {
    label: 'Rose',
    light: {
      accent: '#BE123C',
      onAccent: '#FFFFFF',
      accentSoft: 'rgba(190, 18, 60, 0.12)',
      accentText: '#9F1239',
      playerAccent: '#FDA4AF',
    },
    dark: {
      accent: '#FB7185',
      onAccent: '#1F0A10',
      accentSoft: 'rgba(251, 113, 133, 0.18)',
      accentText: '#FDA4AF',
      playerAccent: '#FDA4AF',
    },
  },
  moss: {
    label: 'Moss',
    light: {
      accent: '#4D7C0F',
      onAccent: '#FFFFFF',
      accentSoft: 'rgba(77, 124, 15, 0.14)',
      accentText: '#3F6212',
      playerAccent: '#BEF264',
    },
    dark: {
      accent: '#A3E635',
      onAccent: '#131A08',
      accentSoft: 'rgba(163, 230, 53, 0.18)',
      accentText: '#BEF264',
      playerAccent: '#BEF264',
    },
  },
  pine: {
    label: 'Pine',
    light: {
      accent: '#15803D',
      onAccent: '#FFFFFF',
      accentSoft: 'rgba(21, 128, 61, 0.14)',
      accentText: '#166534',
      playerAccent: '#6EE7B7',
    },
    dark: {
      accent: '#34D399',
      onAccent: '#06170F',
      accentSoft: 'rgba(52, 211, 153, 0.18)',
      accentText: '#6EE7B7',
      playerAccent: '#6EE7B7',
    },
  },
  clay: {
    label: 'Clay',
    light: {
      accent: '#8D5524',
      onAccent: '#FFFFFF',
      accentSoft: 'rgba(141, 85, 36, 0.14)',
      accentText: '#6B3F1A',
      playerAccent: '#E8C9A8',
    },
    dark: {
      accent: '#D3A17A',
      onAccent: '#1A120C',
      accentSoft: 'rgba(211, 161, 122, 0.18)',
      accentText: '#E8C9A8',
      playerAccent: '#E8C9A8',
    },
  },
} as const satisfies Record<string, { label: string; light: AccentColors; dark: AccentColors }>;

export type AccentName = keyof typeof Accents;

export const ACCENT_CHOICES = Object.keys(Accents) as AccentName[];

/** The accent the app starts with, and the one the base palette above is written around. */
export const DEFAULT_ACCENT: AccentName = 'ember';

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
