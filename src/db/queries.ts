import { getDatabase } from './connection';

export type SavedPlayback = { position: number; duration: number };

export async function getPlaybackState(uri: string): Promise<SavedPlayback | null> {
  const db = await getDatabase();
  return db.getFirstAsync<SavedPlayback>('SELECT position, duration FROM playback_state WHERE uri = ?', [uri]);
}

export async function savePlaybackState(uri: string, position: number, duration: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO playback_state (uri, position, duration, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(uri) DO UPDATE SET position = excluded.position, duration = excluded.duration, updated_at = excluded.updated_at`,
    [uri, Math.max(0, Math.round(position)), Math.max(0, Math.round(duration)), Date.now()]
  );
}

export async function getSetting(key: string): Promise<string | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key]);
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, value]
  );
}

/** Codecs whose hardware decoder failed on this device; they start in software next time. */
export async function getSoftwareDecoderCodecs(): Promise<string[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ codec: string }>('SELECT codec FROM decoder_blacklist');
  return rows.map((row) => row.codec);
}

export async function addSoftwareDecoderCodec(codec: string, reason: string): Promise<void> {
  const normalized = codec.trim().toLowerCase();
  if (!normalized) return;
  const db = await getDatabase();
  await db.runAsync(
    'INSERT OR REPLACE INTO decoder_blacklist (codec, reason, created_at) VALUES (?, ?, ?)',
    [normalized, reason.trim(), Date.now()]
  );
}
