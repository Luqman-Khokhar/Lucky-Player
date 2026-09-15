import { useRouter } from 'expo-router';
import { useCallback } from 'react';

import type { LibraryVideo } from '@/db';
import { useAppDispatch } from '@/store';
import { playQueueSet } from '@/store/play-queue-slice';

/** Opens the player and makes `list` (in on-screen order) the queue for previous, next and auto-play. */
export function usePlayVideo() {
  const router = useRouter();
  const dispatch = useAppDispatch();

  return useCallback(
    (video: LibraryVideo, list: readonly LibraryVideo[]) => {
      dispatch(playQueueSet(list.map((item) => ({ uri: item.uri, title: item.name }))));
      router.push({ pathname: '/player', params: { uri: video.uri, title: video.name } });
    },
    [dispatch, router]
  );
}
