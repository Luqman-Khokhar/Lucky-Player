import * as ScreenOrientation from 'expo-screen-orientation';
import { useCallback, useEffect, useState } from 'react';

function warn(scope: string) {
  return (error: unknown) => console.warn(`[orientation] ${scope}`, error);
}

/** Locks rotation to the current orientation (either landscape side, or portrait); unlocks on unmount. */
export function useOrientationLock() {
  const [locked, setLocked] = useState(false);

  useEffect(
    () => () => {
      ScreenOrientation.unlockAsync().catch(warn('unlock'));
    },
    []
  );

  const toggle = useCallback(async () => {
    try {
      if (locked) {
        await ScreenOrientation.unlockAsync();
        setLocked(false);
        return;
      }
      const current = await ScreenOrientation.getOrientationAsync();
      const landscape =
        current === ScreenOrientation.Orientation.LANDSCAPE_LEFT ||
        current === ScreenOrientation.Orientation.LANDSCAPE_RIGHT;
      await ScreenOrientation.lockAsync(
        landscape ? ScreenOrientation.OrientationLock.LANDSCAPE : ScreenOrientation.OrientationLock.PORTRAIT_UP
      );
      setLocked(true);
    } catch (error) {
      warn('toggle')(error);
    }
  }, [locked]);

  return { locked, toggle };
}
