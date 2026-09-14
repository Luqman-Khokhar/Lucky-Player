import * as NavigationBar from 'expo-navigation-bar';
import { useEffect } from 'react';

/** Hides the Android navigation bar while mounted. Swipe from the edge reveals it temporarily. */
export function useImmersiveMode() {
  useEffect(() => {
    NavigationBar.setVisibilityAsync('hidden').catch(() => undefined);
    return () => {
      NavigationBar.setVisibilityAsync('visible').catch(() => undefined);
    };
  }, []);
}
