import type { ScannedAudio } from '@modules/vlc-player';

import { getDatabase } from './connection';
import { hashString } from './hash';
import type { SortDirection } from './library-queries';

export type TrackSortKey = 'name' | 'artist' | 'album' | 'date' | 'duration';
export type AlbumSortKey = 'name' | 'artist' | 'date' | 'count';
export type AudioFolderSortKey = 'name' | 'date' | 'size' | 'count';

export type LibraryTrack = {
  uri: string;
  /** Tagged title, falling back to the file name. */
  title: string;
  name: string;
  artist: string;
  album: string;
  albumId: number | null;
  trackNo: number;
  folderName: string;
  bucketId: string;
  size: number;
  duration: number;
  modifiedAt: number;
  favorite: boolean;
  /** Saved resume position in ms, 0 when never started or finished. */
  position: number;
  artKey: string;
};

export type LibraryAlbum = {
  albumId: number;
  name: string;
  artist: string;
  trackCount: number;
  totalDuration: number;
  latestModifiedAt: number;
  coverUri: string;
  coverKey: string;
};

export type LibraryAudioFolder = {
  bucketId: string;
  name: string;
  path: string;
  trackCount: number;
  totalSize: number;
  coverUri: string;
  coverKey: string;
};

export type TrackQuery = {
  bucketId?: string;
  albumId?: number;
  favoritesOnly?: boolean;
  search?: string;
  sort: TrackSortKey;
  direction: SortDirection;
};

type TrackRow = Omit<LibraryTrack, 'favorite' | 'artKey'> & { favorite: number; mediaId: number | null };
type CoverRow = { coverMediaId: number | null; coverModifiedAt: number };

const VISIBLE = `a.deleted_at IS NULL AND a.hidden = 0`;

const TRACK_SELECT = `
  SELECT a.uri, a.title, a.name, COALESCE(a.artist, '') AS artist, COALESCE(a.album, '') AS album,
         a.album_id AS albumId, COALESCE(a.track_no, 0) AS trackNo, a.folder AS folderName,
         a.bucket_id AS bucketId, a.size, a.duration, a.mtime AS modifiedAt, a.media_id AS mediaId,
         a.favorite, COALESCE(p.position, 0) AS position
  FROM audio a LEFT JOIN playback_state p ON p.uri = a.uri`;

// Untagged tracks sort last instead of first, where an empty string would otherwise put them.
const TRACK_SORT_SQL: Record<TrackSortKey, string> = {
  name: 'a.title COLLATE NOCASE',
  artist: `NULLIF(a.artist, '') COLLATE NOCASE`,
  album: `NULLIF(a.album, '') COLLATE NOCASE`,
  date: 'a.mtime',
  duration: 'a.duration',
};

const ALBUM_SORT_SQL: Record<AlbumSortKey, string> = {
  name: 'g.name COLLATE NOCASE',
  artist: 'g.artist COLLATE NOCASE',
  date: 'g.latestModifiedAt',
  count: 'g.trackCount',
};

const AUDIO_FOLDER_SORT_SQL: Record<AudioFolderSortKey, string> = {
  name: 'g.name COLLATE NOCASE',
  date: 'g.latestModifiedAt',
  size: 'g.totalSize',
  count: 'g.trackCount',
};

/** Changes when the file changes, so re-tagged tracks get fresh art. */
export function artKeyFor(mediaId: number | null, uri: string, modifiedAt: number): string {
  return mediaId != null ? `art-m${mediaId}-${modifiedAt}` : `art-u${hashString(uri)}-${modifiedAt}`;
}

function toTrack({ favorite, mediaId, ...row }: TrackRow): LibraryTrack {
  return { ...row, favorite: favorite === 1, artKey: artKeyFor(mediaId, row.uri, row.modifiedAt) };
}

function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (match) => `\\${match}`);
}

/** Upserts a full MediaStore audio scan and soft-deletes tracks that disappeared since the previous scan. */
export async function syncScannedAudio(tracks: ScannedAudio[]): Promise<{ total: number; removed: number }> {
  const db = await getDatabase();
  const scanId = Date.now();
  let removed = 0;
  await db.withExclusiveTransactionAsync(async (txn) => {
    const statement = await txn.prepareAsync(`
      INSERT INTO audio (uri, media_id, name, title, artist, album, album_id, track_no, year, folder, bucket_id,
                         relative_path, size, duration, mime_type, mtime, added_at, source, scan_id, deleted_at)
      VALUES ($uri, $mediaId, $name, $title, $artist, $album, $albumId, $trackNo, $year, $folder, $bucketId,
              $relativePath, $size, $duration, $mimeType, $mtime, $addedAt, 'mediastore', $scanId, NULL)
      ON CONFLICT(uri) DO UPDATE SET
        media_id = excluded.media_id, name = excluded.name, title = excluded.title, artist = excluded.artist,
        album = excluded.album, album_id = excluded.album_id, track_no = excluded.track_no, year = excluded.year,
        folder = excluded.folder, bucket_id = excluded.bucket_id, relative_path = excluded.relative_path,
        size = excluded.size, duration = excluded.duration, mime_type = excluded.mime_type, mtime = excluded.mtime,
        added_at = excluded.added_at, scan_id = excluded.scan_id, deleted_at = NULL`);
    try {
      for (const track of tracks) {
        await statement.executeAsync({
          $uri: track.uri,
          $mediaId: track.mediaId,
          $name: track.name,
          $title: track.title,
          $artist: track.artist,
          $album: track.album,
          $albumId: track.albumId,
          $trackNo: track.trackNo,
          $year: track.year,
          $folder: track.bucketName,
          $bucketId: track.bucketId,
          $relativePath: track.relativePath,
          $size: track.size,
          $duration: track.duration,
          $mimeType: track.mimeType,
          $mtime: track.modifiedAt,
          $addedAt: track.addedAt,
          $scanId: scanId,
        });
      }
    } finally {
      await statement.finalizeAsync();
    }
    const result = await txn.runAsync(
      `UPDATE audio SET deleted_at = ? WHERE source = 'mediastore' AND scan_id != ? AND deleted_at IS NULL`,
      [scanId, scanId]
    );
    removed = result.changes;
  });
  return { total: tracks.length, removed };
}

export async function listTracks(query: TrackQuery): Promise<LibraryTrack[]> {
  const db = await getDatabase();
  const where = [VISIBLE];
  const params: (string | number)[] = [];
  if (query.bucketId) {
    where.push('a.bucket_id = ?');
    params.push(query.bucketId);
  }
  if (query.albumId != null) {
    where.push('a.album_id = ?');
    params.push(query.albumId);
  }
  if (query.favoritesOnly) where.push('a.favorite = 1');
  const term = query.search?.trim();
  if (term) {
    where.push(`(a.title LIKE ? ESCAPE '\\' OR a.artist LIKE ? ESCAPE '\\' OR a.album LIKE ? ESCAPE '\\')`);
    const like = `%${escapeLike(term)}%`;
    params.push(like, like, like);
  }
  const direction = query.direction === 'asc' ? 'ASC' : 'DESC';
  // Inside one album, disc order beats the chosen sort: an album read by title is unusable.
  const order = query.albumId != null ? 'a.track_no ASC, a.title COLLATE NOCASE ASC' : null;
  const rows = await db.getAllAsync<TrackRow>(
    `${TRACK_SELECT} WHERE ${where.join(' AND ')}
     ORDER BY ${order ?? `${TRACK_SORT_SQL[query.sort]} ${direction}, a.title COLLATE NOCASE ASC`}`,
    params
  );
  return rows.map(toTrack);
}

/** Tracks by uri, for restoring a saved queue. Missing files are simply absent from the result. */
export async function listTracksByUri(uris: readonly string[]): Promise<LibraryTrack[]> {
  if (uris.length === 0) return [];
  const db = await getDatabase();
  const placeholders = uris.map(() => '?').join(', ');
  const rows = await db.getAllAsync<TrackRow>(
    `${TRACK_SELECT} WHERE ${VISIBLE} AND a.uri IN (${placeholders})`,
    [...uris]
  );
  return rows.map(toTrack);
}

/** Started but unfinished tracks, most recently played first. */
export async function listRecentTracks(limit: number): Promise<LibraryTrack[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<TrackRow>(
    `${TRACK_SELECT} WHERE ${VISIBLE} AND p.position > 0 ORDER BY p.updated_at DESC LIMIT ?`,
    [limit]
  );
  return rows.map(toTrack);
}

export async function listAlbums(sort: AlbumSortKey, direction: SortDirection): Promise<LibraryAlbum[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<LibraryAlbum & CoverRow>(`
    WITH visible AS (SELECT * FROM audio a WHERE ${VISIBLE} AND a.album_id IS NOT NULL),
    ranked AS (
      SELECT album_id, uri, media_id, mtime,
             ROW_NUMBER() OVER (PARTITION BY album_id ORDER BY track_no ASC, mtime DESC) AS rank
      FROM visible
    ),
    g AS (
      SELECT album_id, MAX(COALESCE(NULLIF(album, ''), 'Unknown album')) AS name,
             MAX(COALESCE(NULLIF(artist, ''), '')) AS artist, COUNT(*) AS trackCount,
             SUM(duration) AS totalDuration, MAX(mtime) AS latestModifiedAt
      FROM visible GROUP BY album_id
    )
    SELECT g.album_id AS albumId, g.name, g.artist, g.trackCount, g.totalDuration, g.latestModifiedAt,
           r.uri AS coverUri, r.media_id AS coverMediaId, r.mtime AS coverModifiedAt
    FROM g JOIN ranked r ON r.album_id = g.album_id AND r.rank = 1
    ORDER BY ${ALBUM_SORT_SQL[sort]} ${direction === 'asc' ? 'ASC' : 'DESC'}, g.name COLLATE NOCASE ASC`);
  return rows.map(({ coverMediaId, coverModifiedAt, ...row }) => ({
    ...row,
    coverKey: artKeyFor(coverMediaId, row.coverUri, coverModifiedAt),
  }));
}

export async function listAudioFolders(
  sort: AudioFolderSortKey,
  direction: SortDirection
): Promise<LibraryAudioFolder[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<LibraryAudioFolder & CoverRow>(`
    WITH visible AS (SELECT * FROM audio a WHERE ${VISIBLE}),
    ranked AS (
      SELECT bucket_id, uri, media_id, mtime, ROW_NUMBER() OVER (PARTITION BY bucket_id ORDER BY mtime DESC) AS rank
      FROM visible
    ),
    g AS (
      SELECT bucket_id, MAX(folder) AS name, MAX(relative_path) AS path, COUNT(*) AS trackCount,
             SUM(size) AS totalSize, MAX(mtime) AS latestModifiedAt
      FROM visible GROUP BY bucket_id
    )
    SELECT g.bucket_id AS bucketId, g.name, COALESCE(g.path, '') AS path, g.trackCount, g.totalSize,
           r.uri AS coverUri, r.media_id AS coverMediaId, r.mtime AS coverModifiedAt
    FROM g JOIN ranked r ON r.bucket_id = g.bucket_id AND r.rank = 1
    ORDER BY ${AUDIO_FOLDER_SORT_SQL[sort]} ${direction === 'asc' ? 'ASC' : 'DESC'}, g.name COLLATE NOCASE ASC`);
  return rows.map(({ coverMediaId, coverModifiedAt, ...row }) => ({
    ...row,
    coverKey: artKeyFor(coverMediaId, row.coverUri, coverModifiedAt),
  }));
}

export async function setTrackFavorite(uri: string, favorite: boolean): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('UPDATE audio SET favorite = ? WHERE uri = ?', [favorite ? 1 : 0, uri]);
}

export async function countTracks(): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ count: number }>(`SELECT COUNT(*) AS count FROM audio a WHERE ${VISIBLE}`);
  return row?.count ?? 0;
}
