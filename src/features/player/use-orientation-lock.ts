import * as ScreenOrientation from 'expo-screen-orientation';
import { useCallback, useEffect } from 'react';

function warn(scope: string) {
  return (error: unknown) => console.warn(`[orientation] ${scope}`, error);
}

/** Switches the player between portrait and landscape and holds it there; unlocks on unmount. */
export function useOrientationLock() {
  useEffect(
    () => () => {
      ScreenOrientation.unlockAsync().catch(warn('unlock'));
    },
    []
  );

  const rotate = useCallback(async () => {
    try {
      const current = await ScreenOrientation.getOrientationAsync();
      const landscape =
        current === ScreenOrientation.Orientation.LANDSCAPE_LEFT ||
        current === ScreenOrientation.Orientation.LANDSCAPE_RIGHT;
      await ScreenOrientation.lockAsync(
        landscape ? ScreenOrientation.OrientationLock.PORTRAIT_UP : ScreenOrientation.OrientationLock.LANDSCAPE
      );
    } catch (error) {
      warn('rotate')(error);
    }
  }, []);

  return { rotate };
}
