import { useCallback } from 'react';
import { Linking } from 'react-native';

import { setFavorite, type LibraryVideo } from '@/db';
import { useAppDispatch } from '@/store';
import { libraryChanged, resolveLibraryPermission, scanLibrary } from '@/store/library-slice';

function warn(scope: string) {
  return (error: unknown) => console.warn(`[library] ${scope}`, error);
}

export function useLibraryActions() {
  const dispatch = useAppDispatch();

  const requestAccess = useCallback(() => {
    dispatch(resolveLibraryPermission({ request: true }))
      .unwrap()
      .then(({ permission }) => {
        if (permission !== 'denied') dispatch(scanLibrary({ force: true }));
      })
      .catch(warn('permission request failed'));
  }, [dispatch]);

  const openAppSettings = useCallback(() => {
    Linking.openSettings().catch(warn('could not open settings'));
  }, []);

  const rescan = useCallback(() => {
    dispatch(scanLibrary({ force: true }));
  }, [dispatch]);

  const toggleFavorite = useCallback(
    (video: LibraryVideo) => {
      setFavorite(video.uri, !video.favorite)
        .then(() => dispatch(libraryChanged()))
        .catch(warn('favorite update failed'));
    },
    [dispatch]
  );

  return { requestAccess, openAppSettings, rescan, toggleFavorite };
}
