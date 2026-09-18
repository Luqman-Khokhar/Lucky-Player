/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { useMemo } from 'react';

import { Accents, Colors } from '@/constants/theme';
import { useAppScheme } from '@/hooks/use-app-scheme';
import { useAppSelector } from '@/store';

/** The palette for the current theme, with the accent the user picked in Appearance laid over it. */
export function useTheme() {
  const theme = useAppScheme();
  const accent = useAppSelector((state) => state.settings.accent);

  return useMemo(() => ({ ...Colors[theme], ...Accents[accent][theme] }), [theme, accent]);
}
