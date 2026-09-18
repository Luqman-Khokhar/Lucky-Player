import { themeModes } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAppSelector } from '@/store';

/**
 * The light or dark palette the app should draw with: the phone's own setting, unless the user picked a
 * fixed one in Appearance. A theme that has only one palette, such as Neon, always wins over both.
 */
export function useAppScheme(): 'light' | 'dark' {
  const systemScheme = useColorScheme();
  const mode = useAppSelector((state) => state.settings.themeMode);
  const theme = useAppSelector((state) => state.settings.theme);

  const modes = themeModes(theme);
  if (!modes.includes('light')) return 'dark';

  if (mode !== 'system') return mode;
  return systemScheme === 'dark' ? 'dark' : 'light';
}
