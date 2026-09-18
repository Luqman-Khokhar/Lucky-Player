import { getDatabase } from './connection';
import { artKeyFor, type LibraryTrack } from './audio-queries';

export type Playlist = {
  id: number;
  name: string;
  createdAt: number;
  trackCount: number;
  totalDuration: number;
  /** Empty when the playlist has no tracks yet. */
  coverUri: string;
  coverKey: string;
};

type PlaylistRow = Omit<Playlist, 'coverKey'> & { coverMediaId: number | null; coverModifiedAt: number };
type TrackRow = Omit<LibraryTrack, 'favorite' | 'artKey'> & { favorite: number; mediaId: number | null };

const VISIBLE_TRACK = `a.deleted_at IS NULL AND a.hidden = 0`;

export async function listPlaylists(): Promise<Playlist[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<PlaylistRow>(`
    WITH items AS (
      SELECT i.playlist_id, i.sort, a.uri, a.media_id, a.mtime, a.duration
      FROM playlist_items i JOIN audio a ON a.uri = i.uri AND ${VISIBLE_TRACK}
    ),
    covers AS (
      SELECT playlist_id, uri, media_id, mtime,
             ROW_NUMBER() OVER (PARTITION BY playlist_id ORDER BY sort ASC) AS rank
      FROM items
    )
    SELECT p.id, p.name, p.created_at AS createdAt,
           COUNT(items.uri) AS trackCount, COALESCE(SUM(items.duration), 0) AS totalDuration,
           COALESCE(covers.uri, '') AS coverUri, covers.media_id AS coverMediaId,
           COALESCE(covers.mtime, 0) AS coverModifiedAt
    FROM playlists p
    LEFT JOIN items ON items.playlist_id = p.id
    LEFT JOIN covers ON covers.playlist_id = p.id AND covers.rank = 1
    WHERE p.deleted_at IS NULL
    GROUP BY p.id
    ORDER BY p.name COLLATE NOCASE ASC`);
  return rows.map(({ coverMediaId, coverModifiedAt, ...row }) => ({
    ...row,
    coverKey: artKeyFor(coverMediaId, row.coverUri, coverModifiedAt),
  }));
}

/** Tracks in their saved order. Rows whose file has gone are skipped, not shown as gaps. */
export async function listPlaylistTracks(playlistId: number): Promise<LibraryTrack[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<TrackRow>(
    `SELECT a.uri, a.title, a.name, COALESCE(a.artist, '') AS artist, COALESCE(a.album, '') AS album,
            a.album_id AS albumId, COALESCE(a.track_no, 0) AS trackNo, a.folder AS folderName,
            a.bucket_id AS bucketId, a.size, a.duration, a.mtime AS modifiedAt, a.media_id AS mediaId,
            a.favorite, COALESCE(p.position, 0) AS position
     FROM playlist_items i
     JOIN audio a ON a.uri = i.uri AND ${VISIBLE_TRACK}
     LEFT JOIN playback_state p ON p.uri = a.uri
     WHERE i.playlist_id = ?
     ORDER BY i.sort ASC`,
    [playlistId]
  );
  return rows.map(({ favorite, mediaId, ...row }) => ({
    ...row,
    favorite: favorite === 1,
    artKey: artKeyFor(mediaId, row.uri, row.modifiedAt),
  }));
}

export async function createPlaylist(name: string): Promise<number> {
  const db = await getDatabase();
  const result = await db.runAsync('INSERT INTO playlists (name, created_at) VALUES (?, ?)', [name.trim(), Date.now()]);
  return result.lastInsertRowId;
}

export async function renamePlaylist(id: number, name: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('UPDATE playlists SET name = ? WHERE id = ?', [name.trim(), id]);
}

/** Soft delete, matching the rest of the schema; the items go with it through the foreign key. */
export async function deletePlaylist(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('UPDATE playlists SET deleted_at = ? WHERE id = ?', [Date.now(), id]);
}

/** Appends tracks, skipping any already in the playlist. Resolves how many were actually added. */
export async function addToPlaylist(playlistId: number, uris: readonly string[]): Promise<number> {
  if (uris.length === 0) return 0;
  const db = await getDatabase();
  let added = 0;
  await db.withExclusiveTransactionAsync(async (txn) => {
    const row = await txn.getFirstAsync<{ next: number }>(
      'SELECT COALESCE(MAX(sort), -1) + 1 AS next FROM playlist_items WHERE playlist_id = ?',
      [playlistId]
    );
    let sort = row?.next ?? 0;
    for (const uri of uris) {
      const result = await txn.runAsync(
        'INSERT OR IGNORE INTO playlist_items (playlist_id, uri, sort) VALUES (?, ?, ?)',
        [playlistId, uri, sort]
      );
      if (result.changes > 0) {
        added++;
        sort++;
      }
    }
  });
  return added;
}

export async function removeFromPlaylist(playlistId: number, uri: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM playlist_items WHERE playlist_id = ? AND uri = ?', [playlistId, uri]);
}

/** Rewrites the order from the list the screen shows, so one drag is one write. */
export async function reorderPlaylist(playlistId: number, uris: readonly string[]): Promise<void> {
  const db = await getDatabase();
  await db.withExclusiveTransactionAsync(async (txn) => {
    for (const [sort, uri] of uris.entries()) {
      await txn.runAsync('UPDATE playlist_items SET sort = ? WHERE playlist_id = ? AND uri = ?', [sort, playlistId, uri]);
    }
  });
}

/** Playlists a track is already in, for ticking rows in the add-to-playlist sheet. */
export async function playlistsContaining(uri: string): Promise<number[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ playlist_id: number }>(
    `SELECT i.playlist_id FROM playlist_items i JOIN playlists p ON p.id = i.playlist_id AND p.deleted_at IS NULL
     WHERE i.uri = ?`,
    [uri]
  );
  return rows.map((row) => row.playlist_id);
}
