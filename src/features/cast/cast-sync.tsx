import { useEffect } from 'react';

import { useAppDispatch } from '@/store';
import { castStateChanged } from '@/store/cast-slice';
import VlcPlayer from '@modules/vlc-player';

/** Mirrors the native casting state into the store, including changes from the notification's Stop button. Renders nothing. */
export function CastSync() {
  const dispatch = useAppDispatch();

  useEffect(() => {
    const subscription = VlcPlayer.addListener('onCastStateChanged', ({ state }) => dispatch(castStateChanged(state)));
    VlcPlayer.getCastState()
      .then((state) => dispatch(castStateChanged(state)))
      .catch((error: unknown) => console.warn('[cast] state', error));
    return () => subscription.remove();
  }, [dispatch]);

  return null;
}
