import { useRouter } from 'expo-router';
import { useCallback } from 'react';

import { getPlaybackState, setTrackFavorite, type LibraryTrack } from '@/db';
import { useAppDispatch } from '@/store';
import { libraryChanged } from '@/store/library-slice';
import VlcPlayer, { type AudioQueueItem } from '@modules/vlc-player';

/** Resuming this close to the end starts the track over instead. */
const RESUME_TAIL_MS = 5_000;

function toQueueItem(track: LibraryTrack): AudioQueueItem {
  return {
    uri: track.uri,
    title: track.title,
    artist: track.artist,
    album: track.album,
    artKey: track.artKey,
    duration: track.duration,
  };
}

export function useAudioActions() {
  const dispatch = useAppDispatch();
  const router = useRouter();

  const toggleFavorite = useCallback(
    (track: LibraryTrack) => {
      setTrackFavorite(track.uri, !track.favorite)
        .then(() => dispatch(libraryChanged()))
        .catch((error: unknown) => console.warn('[audio] favorite update failed', error));
    },
    [dispatch]
  );

  /** Hands `list` (in on-screen order) to the playback service and starts at `track`, resuming where it stopped. */
  const playTrack = useCallback(
    (track: LibraryTrack, list: readonly LibraryTrack[]) => {
      const queue = (list.length > 0 ? list : [track]).map(toQueueItem);
      const startIndex = Math.max(
        0,
        queue.findIndex((item) => item.uri === track.uri)
      );
      getPlaybackState(track.uri)
        .then((saved) => {
          const position = saved && saved.duration > 0 && saved.position < saved.duration - RESUME_TAIL_MS
            ? saved.position
            : 0;
          return VlcPlayer.audioSetQueue(JSON.stringify(queue), startIndex, position);
        })
        .then(() => router.push('/now-playing'))
        .catch((error: unknown) => console.warn('[audio] could not start playback', error));
    },
    [router]
  );

  return { toggleFavorite, playTrack };
}
