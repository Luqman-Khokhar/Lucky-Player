import { useRouter } from 'expo-router';
import { useCallback } from 'react';

import { setTrackFavorite, type LibraryTrack } from '@/db';
import { useAppDispatch } from '@/store';
import { libraryChanged } from '@/store/library-slice';
import { playQueueSet } from '@/store/play-queue-slice';

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

  /** Opens the player and makes `list` (in on-screen order) the queue for previous, next and auto-play. */
  const playTrack = useCallback(
    (track: LibraryTrack, list: readonly LibraryTrack[]) => {
      dispatch(playQueueSet(list.map((item) => ({ uri: item.uri, title: item.title }))));
      router.push({ pathname: '/player', params: { uri: track.uri, title: track.title } });
    },
    [dispatch, router]
  );

  return { toggleFavorite, playTrack };
}
