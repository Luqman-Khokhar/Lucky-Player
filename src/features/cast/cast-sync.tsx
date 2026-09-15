import { useEffect } from 'react';

import { useAppDispatch } from '@/store';
import { castPlaybackChanged, castStateChanged } from '@/store/cast-slice';
import VlcPlayer from '@modules/vlc-player';

function warn(scope: string) {
  return (error: unknown) => console.warn(`[cast] ${scope}`, error);
}

/**
 * Mirrors the native casting state and the laptop's playback into the store, including changes from the
 * notification's Stop button. Renders nothing.
 */
export function CastSync() {
  const dispatch = useAppDispatch();

  useEffect(() => {
    const stateSubscription = VlcPlayer.addListener('onCastStateChanged', ({ state }) => dispatch(castStateChanged(state)));
    const playbackSubscription = VlcPlayer.addListener('onCastPlaybackChanged', ({ playback }) =>
      dispatch(castPlaybackChanged(playback))
    );
    VlcPlayer.getCastState()
      .then((state) => dispatch(castStateChanged(state)))
      .catch(warn('state'));
    VlcPlayer.getCastPlayback()
      .then((playback) => dispatch(castPlaybackChanged(playback)))
      .catch(warn('playback'));
    return () => {
      stateSubscription.remove();
      playbackSubscription.remove();
    };
  }, [dispatch]);

  return null;
}
