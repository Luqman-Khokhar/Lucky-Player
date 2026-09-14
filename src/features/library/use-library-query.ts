import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { useAppSelector } from '@/store';

type QueryState<T> = { data: T | null; error: string | null; loading: boolean };

/**
 * Runs a SQLite read and reruns it when `queryKey` changes, the library changes, or the screen
 * regains focus (returning from the player updates resume positions).
 */
export function useLibraryQuery<T>(queryKey: string, fetcher: () => Promise<T>) {
  const version = useAppSelector((state) => state.library.version);
  const fetcherRef = useRef(fetcher);
  const focusedOnce = useRef(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [state, setState] = useState<QueryState<T>>({ data: null, error: null, loading: true });

  useLayoutEffect(() => {
    fetcherRef.current = fetcher;
  });

  useEffect(() => {
    let cancelled = false;
    setState((current) => ({ ...current, loading: true, error: null }));
    fetcherRef
      .current()
      .then((data) => {
        if (!cancelled) setState({ data, error: null, loading: false });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : 'Unknown error';
        setState((current) => ({ data: current.data, error: message, loading: false }));
      });
    return () => {
      cancelled = true;
    };
  }, [queryKey, version, reloadToken]);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  useFocusEffect(
    useCallback(() => {
      if (focusedOnce.current) reload();
      focusedOnce.current = true;
    }, [reload])
  );

  return { ...state, reload };
}
