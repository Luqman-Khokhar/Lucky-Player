import { useEffect } from 'react';
import { AppState } from 'react-native';

import { useAppDispatch } from '@/store';
import { resolveLibraryPermission, scanLibrary } from '@/store/library-slice';

/**
 * Checks video access and rescans on launch and whenever the app returns to the foreground
 * (videos may have been downloaded or deleted meanwhile). The scan thunk throttles repeats.
 */
export function useLibrarySync() {
  const dispatch = useAppDispatch();

  useEffect(() => {
    const refresh = (force: boolean) => {
      dispatch(resolveLibraryPermission({ request: false }))
        .unwrap()
        .then(({ permission }) => {
          if (permission !== 'denied') dispatch(scanLibrary({ force }));
        })
        .catch((error: unknown) => console.warn('[library] permission check failed', error));
    };

    refresh(true);
    const subscription = AppState.addEventListener('change', (status) => {
      if (status === 'active') refresh(false);
    });
    return () => subscription.remove();
  }, [dispatch]);
}
