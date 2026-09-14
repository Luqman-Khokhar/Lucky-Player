import type { ScannedVideo } from '@modules/vlc-player';

import { getDatabase } from './connection';

export type SortDirection = 'asc' | 'desc';
export type VideoSortKey = 'name' | 'date' | 'size' | 'duration';
export type FolderSortKey = 'name' | 'date' | 'size' | 'count';

export type LibraryVideo = {
  uri: string;
  name: string;
  folderName: string;
  bucketId: string;
  size: number;
  duration: number;
  width: number;
  height: number;
  modifiedAt: number;
  favorite: boolean;
  /** Saved resume position in ms, 0 when never started or finished. */
  position: number;
  thumbnailKey: string;
};

export type LibraryFolder = {
  bucketId: string;
  name: string;
  path: string;
  videoCount: number;
  totalSize: number;
  coverUri: string;
  coverKey: string;
};

export type VideoQuery = {
  bucketId?: string;
  favoritesOnly?: boolean;
  search?: string;
  sort: VideoSortKey;
  direction: SortDirection;
};

type VideoRow = Omit<LibraryVideo, 'favorite' | 'thumbnailKey'> & { favorite: number; mediaId: number };
type FolderRow = Omit<LibraryFolder, 'coverKey'> & { coverMediaId: number; coverModifiedAt: number };

const VISIBLE = 'v.deleted_at IS NULL AND v.hidden = 0';

const VIDEO_SELECT = `
  SELECT v.uri, v.name, v.folder AS folderName, v.bucket_id AS bucketId, v.size, v.duration, v.width, v.height,
         v.mtime AS modifiedAt, v.media_id AS mediaId, v.favorite, COALESCE(p.position, 0) AS position
  FROM videos v LEFT JOIN playback_state p ON p.uri = v.uri`;

const VIDEO_SORT_SQL: Record<VideoSortKey, string> = {
  name: 'v.name COLLATE NOCASE',
  date: 'v.mtime',
  size: 'v.size',
  duration: 'v.duration',
};

const FOLDER_SORT_SQL: Record<FolderSortKey, string> = {
  name: 'g.name COLLATE NOCASE',
  date: 'g.latestModifiedAt',
  size: 'g.totalSize',
  count: 'g.videoCount',
};

export function thumbnailKeyFor(mediaId: number, modifiedAt: number): string {
  return `m${mediaId}-${modifiedAt}`;
}

function toVideo({ favorite, mediaId, ...row }: VideoRow): LibraryVideo {
  return { ...row, favorite: favorite === 1, thumbnailKey: thumbnailKeyFor(mediaId, row.modifiedAt) };
}

function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (match) => `\\${match}`);
}

/** Upserts a full MediaStore scan and soft-deletes videos that disappeared since the previous scan. */
export async function syncScannedVideos(videos: ScannedVideo[]): Promise<{ total: number; removed: number }> {
  const db = await getDatabase();
  const scanId = Date.now();
  let removed = 0;
  await db.withExclusiveTransactionAsync(async (txn) => {
    const statement = await txn.prepareAsync(`
      INSERT INTO videos (uri, media_id, name, folder, bucket_id, relative_path, size, duration, width, height, mtime,
                          added_at, mime_type, source, scan_id, deleted_at)
      VALUES ($uri, $mediaId, $name, $folder, $bucketId, $relativePath, $size, $duration, $width, $height, $mtime,
              $addedAt, $mimeType, 'mediastore', $scanId, NULL)
      ON CONFLICT(uri) DO UPDATE SET
        media_id = excluded.media_id, name = excluded.name, folder = excluded.folder, bucket_id = excluded.bucket_id,
        relative_path = excluded.relative_path, size = excluded.size, duration = excluded.duration,
        width = excluded.width, height = excluded.height, mtime = excluded.mtime, added_at = excluded.added_at,
        mime_type = excluded.mime_type, scan_id = excluded.scan_id, deleted_at = NULL`);
    try {
      for (const video of videos) {
        await statement.executeAsync({
          $uri: video.uri,
          $mediaId: video.mediaId,
          $name: video.name,
          $folder: video.bucketName,
          $bucketId: video.bucketId,
          $relativePath: video.relativePath,
          $size: video.size,
          $duration: video.duration,
          $width: video.width,
          $height: video.height,
          $mtime: video.modifiedAt,
          $addedAt: video.addedAt,
          $mimeType: video.mimeType,
          $scanId: scanId,
        });
      }
    } finally {
      await statement.finalizeAsync();
    }
    const result = await txn.runAsync(
      `UPDATE videos SET deleted_at = ? WHERE source = 'mediastore' AND scan_id != ? AND deleted_at IS NULL`,
      [scanId, scanId]
    );
    removed = result.changes;
  });
  return { total: videos.length, removed };
}

export async function listVideos(query: VideoQuery): Promise<LibraryVideo[]> {
  const db = await getDatabase();
  const where = [VISIBLE];
  const params: (string | number)[] = [];
  if (query.bucketId) {
    where.push('v.bucket_id = ?');
    params.push(query.bucketId);
  }
  if (query.favoritesOnly) where.push('v.favorite = 1');
  const term = query.search?.trim();
  if (term) {
    where.push(`v.name LIKE ? ESCAPE '\\'`);
    params.push(`%${escapeLike(term)}%`);
  }
  const direction = query.direction === 'asc' ? 'ASC' : 'DESC';
  const rows = await db.getAllAsync<VideoRow>(
    `${VIDEO_SELECT} WHERE ${where.join(' AND ')}
     ORDER BY ${VIDEO_SORT_SQL[query.sort]} ${direction}, v.name COLLATE NOCASE ASC`,
    params
  );
  return rows.map(toVideo);
}

/** Started but unfinished videos, most recently played first. */
export async function listRecent(limit: number): Promise<LibraryVideo[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<VideoRow>(
    `${VIDEO_SELECT} WHERE ${VISIBLE} AND p.position > 0 ORDER BY p.updated_at DESC LIMIT ?`,
    [limit]
  );
  return rows.map(toVideo);
}

export async function listFolders(sort: FolderSortKey, direction: SortDirection): Promise<LibraryFolder[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<FolderRow>(`
    WITH visible AS (SELECT * FROM videos v WHERE ${VISIBLE}),
    ranked AS (
      SELECT bucket_id, uri, media_id, mtime, ROW_NUMBER() OVER (PARTITION BY bucket_id ORDER BY mtime DESC) AS rank
      FROM visible
    ),
    g AS (
      SELECT bucket_id, MAX(folder) AS name, MAX(relative_path) AS path, COUNT(*) AS videoCount,
             SUM(size) AS totalSize, MAX(mtime) AS latestModifiedAt
      FROM visible GROUP BY bucket_id
    )
    SELECT g.bucket_id AS bucketId, g.name, COALESCE(g.path, '') AS path, g.videoCount, g.totalSize,
           r.uri AS coverUri, r.media_id AS coverMediaId, r.mtime AS coverModifiedAt
    FROM g JOIN ranked r ON r.bucket_id = g.bucket_id AND r.rank = 1
    ORDER BY ${FOLDER_SORT_SQL[sort]} ${direction === 'asc' ? 'ASC' : 'DESC'}, g.name COLLATE NOCASE ASC`);
  return rows.map(({ coverMediaId, coverModifiedAt, ...row }) => ({
    ...row,
    coverKey: thumbnailKeyFor(coverMediaId, coverModifiedAt),
  }));
}

export async function setFavorite(uri: string, favorite: boolean): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('UPDATE videos SET favorite = ? WHERE uri = ?', [favorite ? 1 : 0, uri]);
}
