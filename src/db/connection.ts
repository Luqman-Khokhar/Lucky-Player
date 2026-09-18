import * as SQLite from 'expo-sqlite';

const DATABASE_NAME = 'player.db';

// Append only. Index + 1 is the schema version stored in PRAGMA user_version.
const MIGRATIONS: string[] = [
  `
  CREATE TABLE IF NOT EXISTS videos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uri TEXT NOT NULL UNIQUE,
    folder TEXT,
    name TEXT NOT NULL,
    size INTEGER,
    duration INTEGER,
    width INTEGER,
    height INTEGER,
    video_codec TEXT,
    mtime INTEGER,
    thumbnail TEXT,
    favorite INTEGER NOT NULL DEFAULT 0,
    hidden INTEGER NOT NULL DEFAULT 0,
    deleted_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_videos_folder ON videos(folder) WHERE deleted_at IS NULL;

  CREATE TABLE IF NOT EXISTS playback_state (
    uri TEXT PRIMARY KEY,
    position INTEGER NOT NULL DEFAULT 0,
    duration INTEGER NOT NULL DEFAULT 0,
    audio_track INTEGER,
    subtitle_track INTEGER,
    audio_delay INTEGER NOT NULL DEFAULT 0,
    subtitle_delay INTEGER NOT NULL DEFAULT 0,
    rate REAL NOT NULL DEFAULT 1,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS playlists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    deleted_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS playlist_items (
    playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
    uri TEXT NOT NULL,
    sort INTEGER NOT NULL,
    PRIMARY KEY (playlist_id, uri)
  );

  CREATE TABLE IF NOT EXISTS network_servers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    host TEXT NOT NULL,
    share TEXT,
    username TEXT,
    secret_ref TEXT,
    created_at INTEGER NOT NULL,
    deleted_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS decoder_blacklist (
    codec TEXT PRIMARY KEY,
    reason TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  `,
  // v2: MediaStore library index
  `
  ALTER TABLE videos ADD COLUMN media_id INTEGER;
  ALTER TABLE videos ADD COLUMN bucket_id TEXT;
  ALTER TABLE videos ADD COLUMN relative_path TEXT;
  ALTER TABLE videos ADD COLUMN mime_type TEXT;
  ALTER TABLE videos ADD COLUMN added_at INTEGER;
  ALTER TABLE videos ADD COLUMN source TEXT NOT NULL DEFAULT 'mediastore';
  ALTER TABLE videos ADD COLUMN scan_id INTEGER NOT NULL DEFAULT 0;
  CREATE INDEX IF NOT EXISTS idx_videos_bucket ON videos(bucket_id) WHERE deleted_at IS NULL;
  CREATE INDEX IF NOT EXISTS idx_videos_mtime ON videos(mtime) WHERE deleted_at IS NULL;
  CREATE INDEX IF NOT EXISTS idx_playback_updated ON playback_state(updated_at);
  `,
  // v3: folders added through the system folder picker
  `
  CREATE TABLE IF NOT EXISTS folder_sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tree_uri TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    added_at INTEGER NOT NULL,
    last_scan_at INTEGER,
    last_error TEXT,
    deleted_at INTEGER
  );
  ALTER TABLE videos ADD COLUMN source_id INTEGER;
  CREATE INDEX IF NOT EXISTS idx_videos_name_size ON videos(name, size) WHERE deleted_at IS NULL;
  CREATE INDEX IF NOT EXISTS idx_videos_source ON videos(source, source_id);
  `,
  // v4: per-video decoder choice and picked subtitle file
  `
  ALTER TABLE playback_state ADD COLUMN hw_mode TEXT;
  ALTER TABLE playback_state ADD COLUMN subtitle_uri TEXT;
  `,
  // v5: music library. Kept apart from videos: the columns barely overlap and every video query
  // would otherwise have to filter by media type. playback_state and playlists stay shared.
  `
  CREATE TABLE IF NOT EXISTS audio (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uri TEXT NOT NULL UNIQUE,
    media_id INTEGER,
    name TEXT NOT NULL,
    title TEXT NOT NULL,
    artist TEXT,
    album TEXT,
    album_id INTEGER,
    track_no INTEGER,
    year INTEGER,
    folder TEXT,
    bucket_id TEXT,
    relative_path TEXT,
    size INTEGER,
    duration INTEGER,
    mime_type TEXT,
    mtime INTEGER,
    added_at INTEGER,
    favorite INTEGER NOT NULL DEFAULT 0,
    hidden INTEGER NOT NULL DEFAULT 0,
    source TEXT NOT NULL DEFAULT 'mediastore',
    source_id INTEGER,
    scan_id INTEGER NOT NULL DEFAULT 0,
    deleted_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_audio_bucket ON audio(bucket_id) WHERE deleted_at IS NULL;
  CREATE INDEX IF NOT EXISTS idx_audio_album ON audio(album_id) WHERE deleted_at IS NULL;
  CREATE INDEX IF NOT EXISTS idx_audio_artist ON audio(artist) WHERE deleted_at IS NULL;
  CREATE INDEX IF NOT EXISTS idx_audio_mtime ON audio(mtime) WHERE deleted_at IS NULL;
  `,
];

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function openAndMigrate(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
  // busy_timeout makes a writer wait for a lock instead of failing outright: the library scan holds an
  // exclusive transaction for a while, and playback keeps saving positions and the queue right through it.
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  while (version < MIGRATIONS.length) {
    const next = version + 1;
    const sql = MIGRATIONS[version];
    await db.withTransactionAsync(async () => {
      await db.execAsync(sql);
      await db.execAsync(`PRAGMA user_version = ${next}`);
    });
    version = next;
  }
  return db;
}

export function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  databasePromise ??= openAndMigrate().catch((error: unknown) => {
    databasePromise = null;
    throw error;
  });
  return databasePromise;
}

export async function initDatabase(): Promise<void> {
  await getDatabase();
}
