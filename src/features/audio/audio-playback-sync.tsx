import { useEffect, useRef } from 'react';

import { savePlaybackState } from '@/db';
import { useAppDispatch } from '@/store';
import { audioStateChanged } from '@/store/audio-slice';
import { libraryChanged } from '@/store/library-slice';
import VlcPlayer from '@modules/vlc-player';

/** How often the resume position of the playing track is written to SQLite. */
const SAVE_INTERVAL_MS = 5_000;

/** Mirrors the native playback service into the store and saves resume positions. Renders nothing. */
export function AudioPlaybackSync() {
  const dispatch = useAppDispatch();
  const lastSavedAt = useRef(0);
  const lastUri = useRef<string | null>(null);

  useEffect(() => {
    const subscription = VlcPlayer.addListener('onAudioStateChanged', ({ state }) => {
      dispatch(audioStateChanged(state));

      if (state.errorMessage) console.warn('[audio]', state.errorCode, state.errorMessage);

      const trackChanged = state.uri !== lastUri.current;
      const now = Date.now();
      // Save on every track change, and periodically while one plays, so a crash loses at most a few seconds.
      if (state.uri && state.durationMs > 0 && (trackChanged || now - lastSavedAt.current > SAVE_INTERVAL_MS)) {
        lastSavedAt.current = now;
        savePlaybackState(state.uri, state.positionMs, state.durationMs)
          .then(() => {
            if (trackChanged) dispatch(libraryChanged());
          })
          .catch((error: unknown) => console.warn('[audio] could not save the position', error));
      }
      lastUri.current = state.uri;
    });

    VlcPlayer.getAudioState()
      .then((state) => dispatch(audioStateChanged(state)))
      .catch((error: unknown) => console.warn('[audio] could not read the playback state', error));

    return () => subscription.remove();
  }, [dispatch]);

  return null;
}
