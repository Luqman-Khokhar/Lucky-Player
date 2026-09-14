import type { FolderVideo } from '@modules/vlc-player';

import { getDatabase } from './connection';
import { hashString } from './hash';

export type FolderSource = {
  id: number;
  treeUri: string;
  name: string;
  videoCount: number;
  lastScanAt: number | null;
  /** Set when the last scan failed, usually because folder access was revoked. */
  lastError: string | null;
};

export async function listFolderSources(): Promise<FolderSource[]> {
  const db = await getDatabase();
  return db.getAllAsync<FolderSource>(`
    SELECT s.id, s.tree_uri AS treeUri, s.name, s.last_scan_at AS lastScanAt, s.last_error AS lastError,
           (SELECT COUNT(*) FROM videos v
            WHERE v.source = 'saf' AND v.source_id = s.id AND v.deleted_at IS NULL) AS videoCount
    FROM folder_sources s
    WHERE s.deleted_at IS NULL
    ORDER BY s.name COLLATE NOCASE`);
}

/** Adds a folder, or restores it if it was removed before. Returns its id. */
export async function addFolderSource(treeUri: string, name: string): Promise<number> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO folder_sources (tree_uri, name, added_at) VALUES (?, ?, ?)
     ON CONFLICT(tree_uri) DO UPDATE SET name = excluded.name, deleted_at = NULL, last_error = NULL`,
    [treeUri, name.trim() || 'Folder', Date.now()]
  );
  const row = await db.getFirstAsync<{ id: number }>('SELECT id FROM folder_sources WHERE tree_uri = ?', [treeUri]);
  if (!row) throw new Error('The folder could not be saved');
  return row.id;
}

export async function removeFolderSource(id: number): Promise<void> {
  const db = await getDatabase();
  const now = Date.now();
  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync('UPDATE folder_sources SET deleted_at = ? WHERE id = ?', [now, id]);
    await txn.runAsync(
      `UPDATE videos SET deleted_at = ? WHERE source = 'saf' AND source_id = ? AND deleted_at IS NULL`,
      [now, id]
    );
  });
}

export async function markFolderScanFailed(id: number, message: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('UPDATE folder_sources SET last_error = ? WHERE id = ?', [message.trim() || 'Scan failed', id]);
}

/** Upserts one folder's scan and soft-deletes its videos that disappeared. Returns the number found. */
export async function syncFolderVideos(sourceId: number, videos: FolderVideo[]): Promise<number> {
  const db = await getDatabase();
  const scanId = Date.now();
  await db.withExclusiveTransactionAsync(async (txn) => {
    // Duration and dimensions are unknown from a folder listing; keep any values already stored.
    const statement = await txn.prepareAsync(`
      INSERT INTO videos (uri, name, folder, bucket_id, relative_path, size, duration, width, height, mtime,
                          added_at, mime_type, source, source_id, scan_id, deleted_at)
      VALUES ($uri, $name, $folder, $bucketId, $relativePath, $size, 0, 0, 0, $mtime,
              $addedAt, $mimeType, 'saf', $sourceId, $scanId, NULL)
      ON CONFLICT(uri) DO UPDATE SET
        name = excluded.name, folder = excluded.folder, bucket_id = excluded.bucket_id,
        relative_path = excluded.relative_path, size = excluded.size, mtime = excluded.mtime,
        mime_type = excluded.mime_type, source = 'saf', source_id = excluded.source_id,
        scan_id = excluded.scan_id, deleted_at = NULL`);
    try {
      for (const video of videos) {
        await statement.executeAsync({
          $uri: video.uri,
          $name: video.name,
          $folder: video.folderName,
          $bucketId: `saf-${sourceId}-${hashString(video.parentId)}`,
          $relativePath: video.folderPath,
          $size: video.size,
          $mtime: video.modifiedAt,
          $addedAt: scanId,
          $mimeType: video.mimeType,
          $sourceId: sourceId,
          $scanId: scanId,
        });
      }
    } finally {
      await statement.finalizeAsync();
    }
    await txn.runAsync(
      `UPDATE videos SET deleted_at = ?
       WHERE source = 'saf' AND source_id = ? AND scan_id != ? AND deleted_at IS NULL`,
      [scanId, sourceId, scanId]
    );
    await txn.runAsync('UPDATE folder_sources SET last_scan_at = ?, last_error = NULL WHERE id = ?', [scanId, sourceId]);
  });
  return videos.length;
}
