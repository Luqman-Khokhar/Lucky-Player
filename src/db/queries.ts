import type { HwDecodingMode } from '@modules/vlc-player';

import { getDatabase } from './connection';

/** Per-video picks restored the next time the video opens. Null tracks mean the file's default. */
export type PlaybackChoices = {
  audioTrack: number | null;
  subtitleTrack: number | null;
  audioDelay: number;
  subtitleDelay: number;
  /** Null follows the app-wide decoder setting. */
  hwMode: HwDecodingMode | null;
  /** Subtitle file the user loaded for this video. */
  subtitleUri: string | null;
};

export type SavedPlayback = { position: number; duration: number } & PlaybackChoices;

const CHOICE_COLUMNS: Record<keyof PlaybackChoices, string> = {
  audioTrack: 'audio_track',
  subtitleTrack: 'subtitle_track',
  audioDelay: 'audio_delay',
  subtitleDelay: 'subtitle_delay',
  hwMode: 'hw_mode',
  subtitleUri: 'subtitle_uri',
};

export async function getPlaybackState(uri: string): Promise<SavedPlayback | null> {
  const db = await getDatabase();
  return db.getFirstAsync<SavedPlayback>(
    `SELECT position, duration, audio_track AS audioTrack, subtitle_track AS subtitleTrack,
            audio_delay AS audioDelay, subtitle_delay AS subtitleDelay, hw_mode AS hwMode, subtitle_uri AS subtitleUri
     FROM playback_state WHERE uri = ?`,
    [uri]
  );
}

/** Saves the given picks only; creates the row when the video has no saved position yet. */
export async function savePlaybackChoices(uri: string, choices: Partial<PlaybackChoices>): Promise<void> {
  const keys = (Object.keys(CHOICE_COLUMNS) as (keyof PlaybackChoices)[]).filter((key) => choices[key] !== undefined);
  if (keys.length === 0) return;
  const columns = keys.map((key) => CHOICE_COLUMNS[key]);
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO playback_state (uri, updated_at, ${columns.join(', ')}) VALUES (?, ?, ${columns.map(() => '?').join(', ')})
     ON CONFLICT(uri) DO UPDATE SET ${columns.map((column) => `${column} = excluded.${column}`).join(', ')}`,
    [uri, Date.now(), ...keys.map((key) => choices[key] ?? null)]
  );
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
