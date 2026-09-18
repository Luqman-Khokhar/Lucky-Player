/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { useMemo } from 'react';

import { Accents, Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAppSelector } from '@/store';

/** The palette for the current system theme, with the accent the user picked in Appearance laid over it. */
export function useTheme() {
  const scheme = useColorScheme();
  const accent = useAppSelector((state) => state.settings.accent);
  const theme = scheme === 'dark' ? 'dark' : 'light';

  return useMemo(() => ({ ...Colors[theme], ...Accents[accent][theme] }), [theme, accent]);
}
