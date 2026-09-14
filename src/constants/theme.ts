/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#000000',
    background: '#ffffff',
    backgroundElement: '#F0F0F3',
    backgroundSelected: '#E0E1E6',
    textSecondary: '#60646C',
    accent: '#0B6BCB',
    onAccent: '#FFFFFF',
    danger: '#CE2C31',
    playerBackground: '#000000',
    playerOverlay: 'rgba(0, 0, 0, 0.6)',
    playerText: '#FFFFFF',
    playerTrack: 'rgba(255, 255, 255, 0.3)',
    playerTextSecondary: 'rgba(255, 255, 255, 0.72)',
    playerScrim: 'rgba(0, 0, 0, 0.5)',
    playerSheet: 'rgba(22, 23, 27, 0.97)',
    playerDivider: 'rgba(255, 255, 255, 0.12)',
    playerPressed: 'rgba(255, 255, 255, 0.16)',
    playerBackdrop: 'rgba(0, 0, 0, 0.4)',
    playerAccent: '#5EB1EF',
  },
  dark: {
    text: '#ffffff',
    background: '#000000',
    backgroundElement: '#212225',
    backgroundSelected: '#2E3135',
    textSecondary: '#B0B4BA',
    accent: '#5EB1EF',
    onAccent: '#000000',
    danger: '#FF6369',
    playerBackground: '#000000',
    playerOverlay: 'rgba(0, 0, 0, 0.6)',
    playerText: '#FFFFFF',
    playerTrack: 'rgba(255, 255, 255, 0.3)',
    playerTextSecondary: 'rgba(255, 255, 255, 0.72)',
    playerScrim: 'rgba(0, 0, 0, 0.5)',
    playerSheet: 'rgba(22, 23, 27, 0.97)',
    playerDivider: 'rgba(255, 255, 255, 0.12)',
    playerPressed: 'rgba(255, 255, 255, 0.16)',
    playerBackdrop: 'rgba(0, 0, 0, 0.4)',
    playerAccent: '#5EB1EF',
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

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
