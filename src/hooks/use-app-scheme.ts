import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAppSelector } from '@/store';

/**
 * The light or dark theme the app should draw with: the phone's own setting, unless the user picked a
 * fixed one in Appearance. Always resolves to a real theme, so callers never handle a missing value.
 */
export function useAppScheme(): 'light' | 'dark' {
  const systemScheme = useColorScheme();
  const mode = useAppSelector((state) => state.settings.themeMode);

  if (mode !== 'system') return mode;
  return systemScheme === 'dark' ? 'dark' : 'light';
}
