import { useEffect, useState } from 'react';

import VlcPlayer from '@modules/vlc-player';

// Skip rows that scroll past quickly instead of queueing a native decode for each.
const REQUEST_DELAY_MS = 120;
const MAX_ENTRIES = 1500;

const resolved = new Map<string, string | null>();
const pending = new Map<string, Promise<string | null>>();

function remember(cacheKey: string, path: string | null) {
  if (resolved.size >= MAX_ENTRIES) {
    const oldest = resolved.keys().next().value;
    if (oldest !== undefined) resolved.delete(oldest);
  }
  resolved.set(cacheKey, path);
}

function request(uri: string, key: string, width: number, cacheKey: string): Promise<string | null> {
  let promise = pending.get(cacheKey);
  if (!promise) {
    promise = VlcPlayer.getThumbnail(uri, key, width)
      .catch(() => null)
      .then((path) => {
        pending.delete(cacheKey);
        remember(cacheKey, path);
        return path;
      });
    pending.set(cacheKey, promise);
  }
  return promise;
}

/** Thumbnail file path for a video, or null while loading or when none could be made. */
export function useThumbnail(uri: string, key: string, width: number): string | null {
  const cacheKey = `${key}@${width}`;
  const [loaded, setLoaded] = useState<{ cacheKey: string; path: string | null } | null>(null);

  useEffect(() => {
    if (resolved.has(cacheKey)) return;
    let active = true;
    const timer = setTimeout(() => {
      request(uri, key, width, cacheKey).then((path) => {
        if (active) setLoaded({ cacheKey, path });
      });
    }, REQUEST_DELAY_MS);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [uri, key, width, cacheKey]);

  // Recycled list rows change key before the effect runs; never show the previous row's image.
  if (resolved.has(cacheKey)) return resolved.get(cacheKey) ?? null;
  return loaded?.cacheKey === cacheKey ? loaded.path : null;
}
