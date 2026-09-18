import { getSetting, listTracksByUri, setSetting, type LibraryTrack } from '@/db';

const QUEUE_KEY = 'audio.queue';

type SavedQueue = {
  uris: string[];
  index: number;
  positionMs: number;
};

/** Only the uris are stored; the rest is read back from the audio table, which is the source of truth. */
export async function saveQueue(uris: readonly string[], index: number, positionMs: number): Promise<void> {
  const saved: SavedQueue = { uris: [...uris], index, positionMs };
  await setSetting(QUEUE_KEY, JSON.stringify(saved));
}

export async function clearSavedQueue(): Promise<void> {
  await setSetting(QUEUE_KEY, '');
}

/** The queue from the last session, with tracks that have since gone dropped. Null when there is none. */
export async function loadSavedQueue(): Promise<{ tracks: LibraryTrack[]; index: number; positionMs: number } | null> {
  const raw = await getSetting(QUEUE_KEY);
  if (!raw) return null;

  let saved: SavedQueue;
  try {
    saved = JSON.parse(raw) as SavedQueue;
  } catch {
    return null;
  }
  if (!Array.isArray(saved.uris) || saved.uris.length === 0) return null;

  // One query for just these uris, then reordered here: SQL cannot express "in this exact order".
  const found = await listTracksByUri(saved.uris);
  const byUri = new Map(found.map((track) => [track.uri, track]));
  const tracks = saved.uris.map((uri) => byUri.get(uri)).filter((track): track is LibraryTrack => track !== undefined);
  if (tracks.length === 0) return null;

  const playingUri = saved.uris[saved.index];
  const index = Math.max(
    0,
    tracks.findIndex((track) => track.uri === playingUri)
  );
  return { tracks, index, positionMs: saved.positionMs };
}
