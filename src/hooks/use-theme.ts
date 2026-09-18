/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { useMemo } from 'react';

import { resolvePalette, type Palette } from '@/constants/theme';
import { useAppScheme } from '@/hooks/use-app-scheme';
import { useAppSelector } from '@/store';

/** The palette the app is drawing with: the chosen theme, in the current mode, under the chosen accent. */
export function useTheme(): Palette {
  const mode = useAppScheme();
  const theme = useAppSelector((state) => state.settings.theme);
  const accent = useAppSelector((state) => state.settings.accent);

  return useMemo(() => resolvePalette(theme, mode, accent), [theme, mode, accent]);
}
