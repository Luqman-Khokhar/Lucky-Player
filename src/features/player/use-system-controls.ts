import { useEffect, useMemo, useRef } from 'react';

import VlcPlayer, { type MediaVolume } from '@modules/vlc-player';

// Skip native calls for changes too small to see.
const BRIGHTNESS_EPSILON = 0.01;

export type SystemControls = {
  /** 0..1 */
  getBrightness: () => number;
  /** Applies 0..1 and returns the value in effect. */
  setBrightness: (value: number) => number;
  /** 0..1 */
  getVolume: () => number;
  /** Rounds 0..1 to the nearest volume step and returns the fraction in effect. */
  setVolume: (value: number) => number;
  /** Picks up changes made with the hardware volume keys. */
  refreshVolume: () => void;
};

function warn(scope: string) {
  return (error: unknown) => console.warn(`[system-controls] ${scope}`, error);
}

/** Brightness (player window only, restored on unmount) and media volume for swipe gestures. */
export function useSystemControls(): SystemControls {
  const brightness = useRef(0.5);
  const volume = useRef<MediaVolume>({ current: 0, max: 15 });

  useEffect(() => {
    VlcPlayer.getBrightness()
      .then((value) => {
        brightness.current = value;
      })
      .catch(warn('get brightness'));
    VlcPlayer.getMediaVolume()
      .then((value) => {
        volume.current = value;
      })
      .catch(warn('get volume'));
    return () => {
      VlcPlayer.setBrightness(-1).catch(warn('restore brightness'));
    };
  }, []);

  return useMemo<SystemControls>(
    () => ({
      getBrightness: () => brightness.current,
      setBrightness: (value) => {
        const next = Math.min(1, Math.max(0, value));
        if (Math.abs(next - brightness.current) < BRIGHTNESS_EPSILON) return brightness.current;
        brightness.current = next;
        VlcPlayer.setBrightness(next).catch(warn('set brightness'));
        return next;
      },
      getVolume: () => (volume.current.max > 0 ? volume.current.current / volume.current.max : 0),
      setVolume: (value) => {
        const { current, max } = volume.current;
        if (max <= 0) return 0;
        const index = Math.round(Math.min(1, Math.max(0, value)) * max);
        if (index !== current) {
          volume.current = { current: index, max };
          VlcPlayer.setMediaVolume(index).catch(warn('set volume'));
        }
        return index / max;
      },
      refreshVolume: () => {
        VlcPlayer.getMediaVolume()
          .then((value) => {
            volume.current = value;
          })
          .catch(warn('refresh volume'));
      },
    }),
    []
  );
}
