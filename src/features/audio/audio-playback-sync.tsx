import { useEffect, useRef } from 'react';

import { savePlaybackState } from '@/db';
import { useAppDispatch } from '@/store';
import { audioStateChanged } from '@/store/audio-slice';
import { libraryChanged } from '@/store/library-slice';
import VlcPlayer from '@modules/vlc-player';

import { queueWrite } from './audio-writes';
import { clearSavedQueue, loadSavedQueue, saveQueue } from './queue-storage';
import { toQueueItem } from './use-audio-actions';

/** How often the resume position of the playing track is written to SQLite. */
const SAVE_INTERVAL_MS = 5_000;

function warn(scope: string) {
  return (error: unknown) => console.warn(`[audio] ${scope}`, error);
}

/**
 * Mirrors the native playback service into the store, saves resume positions, and remembers the queue so it
 * comes back after a restart. Renders nothing.
 */
export function AudioPlaybackSync() {
  const dispatch = useAppDispatch();
  const lastSavedAt = useRef(0);
  const lastUri = useRef<string | null>(null);
  const lastQueueVersion = useRef(-1);
  const restored = useRef(false);

  useEffect(() => {
    // A JS reload against an older build leaves the new calls missing; warn once instead of throwing every tick.
    const hasQueueApi = typeof VlcPlayer.getAudioQueue === 'function';
    if (!hasQueueApi) {
      console.warn('[audio] this build has no queue support; reinstall the app to save and restore the queue');
    }

    const subscription = VlcPlayer.addListener('onAudioStateChanged', ({ state }) => {
      dispatch(audioStateChanged(state));

      if (state.errorMessage) console.warn('[audio]', state.errorCode, state.errorMessage);

      const trackChanged = state.uri !== lastUri.current;
      const now = Date.now();
      // Save on every track change, and periodically while one plays, so a crash loses at most a few seconds.
      if (state.uri && state.durationMs > 0 && (trackChanged || now - lastSavedAt.current > SAVE_INTERVAL_MS)) {
        lastSavedAt.current = now;
        const { uri, positionMs, durationMs } = state;
        queueWrite('could not save the position', async () => {
          await savePlaybackState(uri, positionMs, durationMs);
          if (trackChanged) dispatch(libraryChanged());
        });
      }
      lastUri.current = state.uri;

      if (!hasQueueApi) return;

      // The queue only reaches JS when it changes, so the list is not shipped on every position tick.
      if (!state.active) {
        if (lastQueueVersion.current !== -1) queueWrite('could not clear the saved queue', clearSavedQueue);
        lastQueueVersion.current = -1;
        return;
      }
      if (state.queueVersion !== lastQueueVersion.current || trackChanged) {
        lastQueueVersion.current = state.queueVersion;
        const { index, positionMs } = state;
        queueWrite('could not save the queue', async () => {
          const queue = await VlcPlayer.getAudioQueue();
          await saveQueue(
            queue.map((entry) => entry.uri),
            index ?? 0,
            positionMs
          );
        });
      }
    });

    VlcPlayer.getAudioState()
      .then((state) => {
        dispatch(audioStateChanged(state));
        // Bring back the last queue, loaded but paused, so the mini-player is where the user left it.
        if (state.active || restored.current || !hasQueueApi) return;
        restored.current = true;
        return loadSavedQueue().then((saved) => {
          if (!saved) return;
          const queue = JSON.stringify(saved.tracks.map(toQueueItem));
          return VlcPlayer.audioSetQueue(queue, saved.index, saved.positionMs, false);
        });
      })
      .catch(warn('could not read the playback state'));

    return () => subscription.remove();
  }, [dispatch]);

  return null;
}
