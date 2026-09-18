/**
 * Design tokens for the app: themes, type, spacing, radii and elevation.
 *
 * A theme is a full palette, not a tint. It owns the page and card colors, the text ramp, the status
 * colors, and the controls that sit over video. On top of that sits an accent, which is the only part
 * the user picks separately, and which each theme ships its own set of - an accent that works on warm
 * paper rarely works on a neon black.
 *
 * Themes declare which modes they support. Neon and Riot are dark only: forcing either into a light
 * palette washes out the whole point of them, so Appearance locks the light and dark choice instead.
 */

import '@/global.css';

import { Platform } from 'react-native';

/** The splash icon's tile, kept here so the app has one source for its colors. */
export const BrandGradient = ['#F59E0B', '#D2570E'] as const;

/** Everything a palette holds apart from the accent and the controls drawn over video. */
type Neutrals = {
  text: string;
  background: string;
  /** Cards, fields and other raised blocks. */
  backgroundElement: string;
  backgroundSelected: string;
  textSecondary: string;
  /** Third level of text: timestamps, counts, hints. */
  textTertiary: string;
  danger: string;
  dangerSoft: string;
  success: string;
  warning: string;
  /** Hairline between rows and around cards. */
  border: string;
  borderStrong: string;
  /** Dim layer behind sheets and dialogs. */
  overlay: string;
  shadow: string;
};

/** Controls drawn on top of video. Always dark, whatever the rest of the theme does. */
type PlayerColors = {
  playerBackground: string;
  playerOverlay: string;
  playerText: string;
  playerTrack: string;
  playerTextSecondary: string;
  playerScrim: string;
  playerSheet: string;
  playerDivider: string;
  playerPressed: string;
  playerBackdrop: string;
};

/** The part of a palette an accent replaces. */
type AccentColors = {
  accent: string;
  onAccent: string;
  accentSoft: string;
  accentText: string;
  playerAccent: string;
};

export type Palette = Neutrals & PlayerColors & AccentColors;

/** The two palettes a theme can be drawn in. The user's System / Light / Dark choice is separate. */
export type ColorMode = 'light' | 'dark';

type Accent = {
  label: string;
  light: AccentColors;
  dark: AccentColors;
};

type ThemeDefinition = {
  label: string;
  /** One line under the name in Appearance. */
  description: string;
  light: (Neutrals & PlayerColors) | null;
  dark: Neutrals & PlayerColors;
  accents: Record<string, Accent>;
  defaultAccent: string;
};

/** The player colors most themes use. A theme overrides only what it needs. */
const basePlayer: PlayerColors = {
  playerBackground: '#000000',
  playerOverlay: 'rgba(0, 0, 0, 0.6)',
  playerText: '#FFFFFF',
  playerTrack: 'rgba(255, 255, 255, 0.28)',
  playerTextSecondary: 'rgba(255, 255, 255, 0.72)',
  playerScrim: 'rgba(16, 16, 18, 0.62)',
  playerSheet: 'rgba(20, 20, 24, 0.97)',
  playerDivider: 'rgba(255, 255, 255, 0.12)',
  playerPressed: 'rgba(255, 255, 255, 0.18)',
  playerBackdrop: 'rgba(0, 0, 0, 0.55)',
};

export const Themes = {
  ember: {
    label: 'Ember',
    description: 'Warm paper and charcoal. The one the app ships with.',
    light: {
      text: '#1B1613',
      background: '#F6F2EC',
      backgroundElement: '#FFFCF7',
      backgroundSelected: '#EAE2D6',
      textSecondary: '#5C534B',
      textTertiary: '#6E655C',
      danger: '#BE123C',
      dangerSoft: 'rgba(190, 18, 60, 0.12)',
      success: '#15803D',
      warning: '#A16207',
      border: '#E3DACC',
      borderStrong: '#CBBFAD',
      overlay: 'rgba(27, 22, 19, 0.45)',
      shadow: '#1B1613',
      ...basePlayer,
      playerScrim: 'rgba(24, 19, 15, 0.62)',
      playerSheet: 'rgba(28, 23, 19, 0.97)',
    },
    dark: {
      text: '#F5F0EA',
      background: '#131110',
      backgroundElement: '#1F1B19',
      backgroundSelected: '#302A26',
      textSecondary: '#A9A09A',
      textTertiary: '#8B827A',
      danger: '#FB7185',
      dangerSoft: 'rgba(251, 113, 133, 0.18)',
      success: '#4ADE80',
      warning: '#FBBF24',
      border: '#2B2522',
      borderStrong: '#3E3733',
      overlay: 'rgba(0, 0, 0, 0.6)',
      shadow: '#000000',
      ...basePlayer,
      playerScrim: 'rgba(24, 19, 15, 0.62)',
      playerSheet: 'rgba(28, 23, 19, 0.97)',
    },
    defaultAccent: 'ember',
    accents: {
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
    },
  },

  graphite: {
    label: 'Graphite',
    description: 'Quiet greys and one restrained colour, so the video is the loud part.',
    light: {
      text: '#17191C',
      background: '#F4F5F6',
      backgroundElement: '#FFFFFF',
      backgroundSelected: '#E4E6E9',
      textSecondary: '#55595F',
      textTertiary: '#676C74',
      danger: '#B3261E',
      dangerSoft: 'rgba(179, 38, 30, 0.12)',
      success: '#15803D',
      warning: '#A16207',
      border: '#E1E3E6',
      borderStrong: '#C7CACF',
      overlay: 'rgba(23, 25, 28, 0.45)',
      shadow: '#17191C',
      ...basePlayer,
    },
    dark: {
      text: '#F1F2F4',
      background: '#101113',
      backgroundElement: '#191B1E',
      backgroundSelected: '#292C31',
      textSecondary: '#A0A5AC',
      textTertiary: '#82878F',
      danger: '#FF6B6B',
      dangerSoft: 'rgba(255, 107, 107, 0.18)',
      success: '#4ADE80',
      warning: '#FBBF24',
      border: '#24272B',
      borderStrong: '#363A40',
      overlay: 'rgba(0, 0, 0, 0.6)',
      shadow: '#000000',
      ...basePlayer,
    },
    defaultAccent: 'slate',
    accents: {
      slate: {
        label: 'Slate',
        light: {
          accent: '#3D4752',
          onAccent: '#FFFFFF',
          accentSoft: 'rgba(61, 71, 82, 0.12)',
          accentText: '#2C343D',
          playerAccent: '#E2E6EB',
        },
        dark: {
          accent: '#C6CDD6',
          onAccent: '#14171A',
          accentSoft: 'rgba(198, 205, 214, 0.16)',
          accentText: '#E2E6EB',
          playerAccent: '#E2E6EB',
        },
      },
      copper: {
        label: 'Copper',
        light: {
          accent: '#9A5B2D',
          onAccent: '#FFFFFF',
          accentSoft: 'rgba(154, 91, 45, 0.14)',
          accentText: '#7A4522',
          playerAccent: '#F0CFAE',
        },
        dark: {
          accent: '#E0A878',
          onAccent: '#1A120B',
          accentSoft: 'rgba(224, 168, 120, 0.18)',
          accentText: '#F0CFAE',
          playerAccent: '#F0CFAE',
        },
      },
      sage: {
        label: 'Sage',
        light: {
          accent: '#4B6A57',
          onAccent: '#FFFFFF',
          accentSoft: 'rgba(75, 106, 87, 0.14)',
          accentText: '#3A5344',
          playerAccent: '#C4DECF',
        },
        dark: {
          accent: '#9CC5AC',
          onAccent: '#0E1611',
          accentSoft: 'rgba(156, 197, 172, 0.18)',
          accentText: '#C4DECF',
          playerAccent: '#C4DECF',
        },
      },
    },
  },

  neon: {
    label: 'Neon',
    description: 'Black glass and electric light. Dark only.',
    light: null,
    dark: {
      text: '#F2F5FF',
      background: '#060608',
      backgroundElement: '#0E1016',
      backgroundSelected: '#1A1E28',
      textSecondary: '#A3ABC0',
      textTertiary: '#7C8499',
      danger: '#FF3B6B',
      dangerSoft: 'rgba(255, 59, 107, 0.20)',
      success: '#39FF9E',
      warning: '#FFD166',
      border: '#1B2030',
      borderStrong: '#2B3348',
      overlay: 'rgba(0, 0, 0, 0.7)',
      shadow: '#000000',
      ...basePlayer,
      playerScrim: 'rgba(6, 6, 10, 0.66)',
      playerSheet: 'rgba(10, 12, 18, 0.97)',
      playerDivider: 'rgba(0, 229, 208, 0.18)',
      playerPressed: 'rgba(0, 229, 208, 0.16)',
    },
    defaultAccent: 'cyan',
    accents: {
      cyan: {
        label: 'Cyan',
        light: {
          accent: '#00E5D0',
          onAccent: '#04120F',
          accentSoft: 'rgba(0, 229, 208, 0.18)',
          accentText: '#5FFFF0',
          playerAccent: '#5FFFF0',
        },
        dark: {
          accent: '#00E5D0',
          onAccent: '#04120F',
          accentSoft: 'rgba(0, 229, 208, 0.18)',
          accentText: '#5FFFF0',
          playerAccent: '#5FFFF0',
        },
      },
      magenta: {
        label: 'Magenta',
        light: {
          accent: '#FF2E88',
          onAccent: '#16040C',
          accentSoft: 'rgba(255, 46, 136, 0.20)',
          accentText: '#FF8FC4',
          playerAccent: '#FF8FC4',
        },
        dark: {
          accent: '#FF2E88',
          onAccent: '#16040C',
          accentSoft: 'rgba(255, 46, 136, 0.20)',
          accentText: '#FF8FC4',
          playerAccent: '#FF8FC4',
        },
      },
      lime: {
        label: 'Lime',
        light: {
          accent: '#B6FF3B',
          onAccent: '#0F1604',
          accentSoft: 'rgba(182, 255, 59, 0.18)',
          accentText: '#D6FF8C',
          playerAccent: '#D6FF8C',
        },
        dark: {
          accent: '#B6FF3B',
          onAccent: '#0F1604',
          accentSoft: 'rgba(182, 255, 59, 0.18)',
          accentText: '#D6FF8C',
          playerAccent: '#D6FF8C',
        },
      },
    },
  },

  riot: {
    label: 'Riot',
    description: 'Black, bone and acid. Loud on purpose. Dark only.',
    light: null,
    dark: {
      text: '#F5F5F0',
      background: '#0B0B0B',
      backgroundElement: '#141414',
      backgroundSelected: '#242424',
      textSecondary: '#ADADA4',
      textTertiary: '#8A8A82',
      danger: '#FF3D2E',
      dangerSoft: 'rgba(255, 61, 46, 0.20)',
      success: '#7CFF4F',
      warning: '#FFD400',
      border: '#262626',
      borderStrong: '#3A3A3A',
      overlay: 'rgba(0, 0, 0, 0.7)',
      shadow: '#000000',
      ...basePlayer,
      playerScrim: 'rgba(11, 11, 11, 0.68)',
      playerSheet: 'rgba(16, 16, 16, 0.98)',
    },
    defaultAccent: 'acid',
    accents: {
      acid: {
        label: 'Acid',
        light: {
          accent: '#C9F227',
          onAccent: '#0B0B04',
          accentSoft: 'rgba(201, 242, 39, 0.18)',
          accentText: '#DEFF6B',
          playerAccent: '#DEFF6B',
        },
        dark: {
          accent: '#C9F227',
          onAccent: '#0B0B04',
          accentSoft: 'rgba(201, 242, 39, 0.18)',
          accentText: '#DEFF6B',
          playerAccent: '#DEFF6B',
        },
      },
      bleach: {
        label: 'Bleach',
        light: {
          accent: '#F5F5F0',
          onAccent: '#0B0B0B',
          accentSoft: 'rgba(245, 245, 240, 0.14)',
          accentText: '#F5F5F0',
          playerAccent: '#F5F5F0',
        },
        dark: {
          accent: '#F5F5F0',
          onAccent: '#0B0B0B',
          accentSoft: 'rgba(245, 245, 240, 0.14)',
          accentText: '#F5F5F0',
          playerAccent: '#F5F5F0',
        },
      },
      siren: {
        label: 'Siren',
        light: {
          accent: '#FF6A00',
          onAccent: '#140700',
          accentSoft: 'rgba(255, 106, 0, 0.20)',
          accentText: '#FFA766',
          playerAccent: '#FFA766',
        },
        dark: {
          accent: '#FF6A00',
          onAccent: '#140700',
          accentSoft: 'rgba(255, 106, 0, 0.20)',
          accentText: '#FFA766',
          playerAccent: '#FFA766',
        },
      },
    },
  },

  bloom: {
    label: 'Bloom',
    description: 'Soft blush and cream. Gentle on the eyes, late at night too.',
    light: {
      text: '#2A2126',
      background: '#FBF4F6',
      backgroundElement: '#FFFDFE',
      backgroundSelected: '#F2E3E9',
      textSecondary: '#6B5A63',
      textTertiary: '#776771',
      danger: '#B3324F',
      dangerSoft: 'rgba(179, 50, 79, 0.12)',
      success: '#2F7D5C',
      warning: '#966C1B',
      border: '#EFDFE6',
      borderStrong: '#D8C2CC',
      overlay: 'rgba(42, 33, 38, 0.42)',
      shadow: '#2A2126',
      ...basePlayer,
      playerScrim: 'rgba(23, 19, 23, 0.62)',
      playerSheet: 'rgba(30, 25, 30, 0.97)',
    },
    dark: {
      text: '#F3EAEF',
      background: '#171317',
      backgroundElement: '#211C21',
      backgroundSelected: '#322A31',
      textSecondary: '#B3A4AE',
      textTertiary: '#91828B',
      danger: '#F58FA8',
      dangerSoft: 'rgba(245, 143, 168, 0.18)',
      success: '#7FD6AE',
      warning: '#EFC978',
      border: '#2C252B',
      borderStrong: '#40363E',
      overlay: 'rgba(0, 0, 0, 0.6)',
      shadow: '#000000',
      ...basePlayer,
      playerScrim: 'rgba(23, 19, 23, 0.62)',
      playerSheet: 'rgba(30, 25, 30, 0.97)',
    },
    defaultAccent: 'mauve',
    accents: {
      mauve: {
        label: 'Mauve',
        light: {
          accent: '#7A4B72',
          onAccent: '#FFFFFF',
          accentSoft: 'rgba(122, 75, 114, 0.12)',
          accentText: '#5E385A',
          playerAccent: '#EBC9E4',
        },
        dark: {
          accent: '#D9A7CF',
          onAccent: '#1A1018',
          accentSoft: 'rgba(217, 167, 207, 0.18)',
          accentText: '#EBC9E4',
          playerAccent: '#EBC9E4',
        },
      },
      peach: {
        label: 'Peach',
        light: {
          accent: '#B45B45',
          onAccent: '#FFFFFF',
          accentSoft: 'rgba(180, 91, 69, 0.14)',
          accentText: '#8E4433',
          playerAccent: '#F7D2C1',
        },
        dark: {
          accent: '#F0B39B',
          onAccent: '#1D110C',
          accentSoft: 'rgba(240, 179, 155, 0.18)',
          accentText: '#F7D2C1',
          playerAccent: '#F7D2C1',
        },
      },
      sage: {
        label: 'Sage',
        light: {
          accent: '#4F7361',
          onAccent: '#FFFFFF',
          accentSoft: 'rgba(79, 115, 97, 0.14)',
          accentText: '#3C5A4B',
          playerAccent: '#C9E2D4',
        },
        dark: {
          accent: '#A8CDB8',
          onAccent: '#101711',
          accentSoft: 'rgba(168, 205, 184, 0.18)',
          accentText: '#C9E2D4',
          playerAccent: '#C9E2D4',
        },
      },
    },
  },
} as const satisfies Record<string, ThemeDefinition>;

export type ThemeName = keyof typeof Themes;

export const THEME_CHOICES = Object.keys(Themes) as ThemeName[];

/** The theme the app starts with. */
export const DEFAULT_THEME: ThemeName = 'ember';

export type ThemeColor = keyof Palette;

/** The modes a theme can be drawn in. A theme with no light palette is dark only. */
export function themeModes(name: ThemeName): ColorMode[] {
  return Themes[name].light ? ['light', 'dark'] : ['dark'];
}

/** The accents a theme ships, in the order they are declared. */
export function accentsFor(name: ThemeName): ({ key: string } & Accent)[] {
  const accents = Themes[name].accents as Record<string, Accent>;
  return Object.keys(accents).map((key) => ({ key, ...accents[key] }));
}

/** The accent to draw with: the one asked for, or the theme's own default when it does not carry it. */
export function resolveAccent(name: ThemeName, accent: string): string {
  return accent in Themes[name].accents ? accent : Themes[name].defaultAccent;
}

/** The name shown for an accent, falling back to the theme's default when the accent is not its own. */
export function accentLabel(name: ThemeName, accent: string): string {
  const accents = Themes[name].accents as Record<string, Accent>;
  return accents[resolveAccent(name, accent)].label;
}

/** The full palette for a theme, in a mode it supports, with an accent laid over it. */
export function resolvePalette(name: ThemeName, mode: ColorMode, accent: string): Palette {
  const theme = Themes[name];
  const base = mode === 'light' && theme.light ? theme.light : theme.dark;
  const accents = theme.accents as Record<string, Accent>;
  const chosen = accents[resolveAccent(name, accent)];

  return { ...base, ...(mode === 'light' && theme.light ? chosen.light : chosen.dark) };
}
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
