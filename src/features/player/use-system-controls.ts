import { useEffect, useMemo, useRef } from 'react';

import { useAppDispatch, useAppSelector } from '@/store';
import { BOOST_WARNING_PERCENT, MAX_BOOST_PERCENT, setBoostEnabled, setBoostPercent } from '@/store/sound-slice';
import VlcPlayer, { type MediaVolume } from '@modules/vlc-player';

// Skip native calls for changes too small to see.
const BRIGHTNESS_EPSILON = 0.01;
const BOOST_SWIPE_STEP = 5;

/** Volume levels run 0..2: 0..1 is the phone's media volume, 1..2 adds the shared volume boost up to +100%. */
export const VOLUME_LEVEL_MAX = 2;

export type SystemControls = {
  /** 0..1 */
  getBrightness: () => number;
  /** Applies 0..1 and returns the value in effect. */
  setBrightness: (value: number) => number;
  /** 0..2, see VOLUME_LEVEL_MAX. */
  getVolume: () => number;
  /** Applies 0..2 (phone volume steps, then boost in 5% steps up to the allowed limit) and returns the level in effect. */
  setVolume: (value: number) => number;
  /** Picks up changes made with the hardware volume keys. */
  refreshVolume: () => void;
};

function warn(scope: string) {
  return (error: unknown) => console.warn(`[system-controls] ${scope}`, error);
}

/** Brightness (player window only, restored on unmount), media volume and the shared volume boost for swipe gestures. */
export function useSystemControls(): SystemControls {
  const dispatch = useAppDispatch();
  const boostEnabled = useAppSelector((state) => state.sound.boostEnabled);
  const boostPercent = useAppSelector((state) => state.sound.boostPercent);
  const boostLimit = useAppSelector((state) =>
    state.sound.boostWarningAccepted ? MAX_BOOST_PERCENT : BOOST_WARNING_PERCENT
  );
  const brightness = useRef(0.5);
  const volume = useRef<MediaVolume>({ current: 0, max: 15 });
  const boost = useRef({ percent: boostEnabled ? boostPercent : 0, limit: boostLimit });

  useEffect(() => {
    boost.current = { percent: boostEnabled ? boostPercent : 0, limit: boostLimit };
  }, [boostEnabled, boostPercent, boostLimit]);

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
      getVolume: () => {
        const { current, max } = volume.current;
        if (max <= 0) return 0;
        return current >= max ? 1 + boost.current.percent / 100 : current / max;
      },
      setVolume: (value) => {
        const { current, max } = volume.current;
        if (max <= 0) return 0;
        const clamped = Math.min(VOLUME_LEVEL_MAX, Math.max(0, value));
        const index = Math.round(Math.min(1, clamped) * max);
        if (index !== current) {
          volume.current = { current: index, max };
          VlcPlayer.setMediaVolume(index).catch(warn('set volume'));
        }
        const wanted = clamped > 1 ? Math.round(((clamped - 1) * 100) / BOOST_SWIPE_STEP) * BOOST_SWIPE_STEP : 0;
        const percent = index >= max ? Math.min(boost.current.limit, wanted) : 0;
        if (percent !== boost.current.percent) {
          boost.current = { ...boost.current, percent };
          // Swiping back to +0% keeps the boost switched on, so its notification controls stay available.
          if (percent > 0) dispatch(setBoostEnabled(true));
          dispatch(setBoostPercent(percent));
        }
        return index / max + percent / 100;
      },
      refreshVolume: () => {
        VlcPlayer.getMediaVolume()
          .then((value) => {
            volume.current = value;
          })
          .catch(warn('refresh volume'));
      },
    }),
    [dispatch]
  );
}
