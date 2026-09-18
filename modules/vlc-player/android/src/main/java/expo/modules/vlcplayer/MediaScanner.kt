package expo.modules.vlcplayer

import android.content.ContentUris
import android.content.Context
import android.os.Build
import android.provider.MediaStore

/** Lists every indexed video or audio track (internal storage and SD cards) in a single MediaStore query. */
object MediaScanner {
  fun scanVideos(context: Context): List<Map<String, Any>> {
    val collection = if (Build.VERSION.SDK_INT >= 29) {
      MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL)
    } else {
      MediaStore.Video.Media.EXTERNAL_CONTENT_URI
    }
    val projection = mutableListOf(
      MediaStore.Video.Media._ID,
      MediaStore.Video.Media.DISPLAY_NAME,
      MediaStore.Video.Media.SIZE,
      MediaStore.Video.Media.DURATION,
      MediaStore.Video.Media.WIDTH,
      MediaStore.Video.Media.HEIGHT,
      MediaStore.Video.Media.DATE_MODIFIED,
      MediaStore.Video.Media.DATE_ADDED,
      MediaStore.Video.Media.MIME_TYPE,
      MediaStore.Video.Media.BUCKET_ID,
      MediaStore.Video.Media.BUCKET_DISPLAY_NAME
    )
    if (Build.VERSION.SDK_INT >= 29) projection += MediaStore.Video.Media.RELATIVE_PATH
    // Skip files still being written by another app.
    val selection = if (Build.VERSION.SDK_INT >= 29) "${MediaStore.Video.Media.IS_PENDING} = 0" else null

    val videos = ArrayList<Map<String, Any>>()
    context.contentResolver.query(collection, projection.toTypedArray(), selection, null, null)?.use { cursor ->
      val idColumn = cursor.getColumnIndexOrThrow(MediaStore.Video.Media._ID)
      val nameColumn = cursor.getColumnIndexOrThrow(MediaStore.Video.Media.DISPLAY_NAME)
      val sizeColumn = cursor.getColumnIndexOrThrow(MediaStore.Video.Media.SIZE)
      val durationColumn = cursor.getColumnIndexOrThrow(MediaStore.Video.Media.DURATION)
      val widthColumn = cursor.getColumnIndexOrThrow(MediaStore.Video.Media.WIDTH)
      val heightColumn = cursor.getColumnIndexOrThrow(MediaStore.Video.Media.HEIGHT)
      val modifiedColumn = cursor.getColumnIndexOrThrow(MediaStore.Video.Media.DATE_MODIFIED)
      val addedColumn = cursor.getColumnIndexOrThrow(MediaStore.Video.Media.DATE_ADDED)
      val mimeColumn = cursor.getColumnIndexOrThrow(MediaStore.Video.Media.MIME_TYPE)
      val bucketIdColumn = cursor.getColumnIndexOrThrow(MediaStore.Video.Media.BUCKET_ID)
      val bucketNameColumn = cursor.getColumnIndexOrThrow(MediaStore.Video.Media.BUCKET_DISPLAY_NAME)
      val pathColumn = if (Build.VERSION.SDK_INT >= 29) cursor.getColumnIndexOrThrow(MediaStore.Video.Media.RELATIVE_PATH) else -1

      while (cursor.moveToNext()) {
        val id = cursor.getLong(idColumn)
        videos += mapOf(
          "mediaId" to id,
          "uri" to ContentUris.withAppendedId(collection, id).toString(),
          "name" to (cursor.getString(nameColumn) ?: "Video $id"),
          "size" to cursor.getLong(sizeColumn),
          "duration" to cursor.getLong(durationColumn),
          "width" to cursor.getInt(widthColumn),
          "height" to cursor.getInt(heightColumn),
          "modifiedAt" to cursor.getLong(modifiedColumn) * 1000,
          "addedAt" to cursor.getLong(addedColumn) * 1000,
          "mimeType" to (cursor.getString(mimeColumn) ?: ""),
          "bucketId" to (cursor.getString(bucketIdColumn) ?: "unknown"),
          "bucketName" to (cursor.getString(bucketNameColumn) ?: "Unknown folder"),
          "relativePath" to (if (pathColumn >= 0) cursor.getString(pathColumn) ?: "" else "")
        )
      }
    }
    return videos
  }

  /** Every indexed audio track that is music (ringtones, notifications and alarms are skipped). */
  fun scanAudio(context: Context): List<Map<String, Any>> {
    val collection = if (Build.VERSION.SDK_INT >= 29) {
      MediaStore.Audio.Media.getContentUri(MediaStore.VOLUME_EXTERNAL)
    } else {
      MediaStore.Audio.Media.EXTERNAL_CONTENT_URI
    }
    val projection = mutableListOf(
      MediaStore.Audio.Media._ID,
      MediaStore.Audio.Media.DISPLAY_NAME,
      MediaStore.Audio.Media.TITLE,
      MediaStore.Audio.Media.SIZE,
      MediaStore.Audio.Media.DURATION,
      MediaStore.Audio.Media.DATE_MODIFIED,
      MediaStore.Audio.Media.DATE_ADDED,
      MediaStore.Audio.Media.MIME_TYPE,
      MediaStore.Audio.Media.ARTIST,
      MediaStore.Audio.Media.ALBUM,
      MediaStore.Audio.Media.ALBUM_ID,
      MediaStore.Audio.Media.TRACK,
      MediaStore.Audio.Media.YEAR,
      MediaStore.Audio.Media.BUCKET_ID,
      MediaStore.Audio.Media.BUCKET_DISPLAY_NAME
    )
    if (Build.VERSION.SDK_INT >= 29) projection += MediaStore.Audio.Media.RELATIVE_PATH
    val selection = StringBuilder("${MediaStore.Audio.Media.IS_MUSIC} != 0")
    // Skip files still being written by another app.
    if (Build.VERSION.SDK_INT >= 29) selection.append(" AND ${MediaStore.Audio.Media.IS_PENDING} = 0")

    val tracks = ArrayList<Map<String, Any>>()
    context.contentResolver.query(collection, projection.toTypedArray(), selection.toString(), null, null)?.use { cursor ->
      val idColumn = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media._ID)
      val fileNameColumn = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.DISPLAY_NAME)
      val titleColumn = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.TITLE)
      val sizeColumn = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.SIZE)
      val durationColumn = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.DURATION)
      val modifiedColumn = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.DATE_MODIFIED)
      val addedColumn = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.DATE_ADDED)
      val mimeColumn = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.MIME_TYPE)
      val artistColumn = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.ARTIST)
      val albumColumn = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.ALBUM)
      val albumIdColumn = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.ALBUM_ID)
      val trackColumn = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.TRACK)
      val yearColumn = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.YEAR)
      val bucketIdColumn = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.BUCKET_ID)
      val bucketNameColumn = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.BUCKET_DISPLAY_NAME)
      val pathColumn = if (Build.VERSION.SDK_INT >= 29) cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.RELATIVE_PATH) else -1

      while (cursor.moveToNext()) {
        val id = cursor.getLong(idColumn)
        val fileName = cursor.getString(fileNameColumn) ?: "Track $id"
        val artist = cursor.getString(artistColumn)
        // MediaStore writes the literal "<unknown>" when a file carries no artist tag.
        tracks += mapOf(
          "mediaId" to id,
          "uri" to ContentUris.withAppendedId(collection, id).toString(),
          "name" to fileName,
          "title" to (cursor.getString(titleColumn)?.takeIf { it.isNotBlank() } ?: fileName),
          "size" to cursor.getLong(sizeColumn),
          "duration" to cursor.getLong(durationColumn),
          "modifiedAt" to cursor.getLong(modifiedColumn) * 1000,
          "addedAt" to cursor.getLong(addedColumn) * 1000,
          "mimeType" to (cursor.getString(mimeColumn) ?: ""),
          "artist" to (artist?.takeIf { it.isNotBlank() && it != "<unknown>" } ?: ""),
          "album" to (cursor.getString(albumColumn)?.takeIf { it.isNotBlank() } ?: ""),
          "albumId" to cursor.getLong(albumIdColumn),
          // TRACK is disc * 1000 + track for multi-disc albums.
          "trackNo" to (cursor.getInt(trackColumn) % 1000),
          "year" to cursor.getInt(yearColumn),
          "bucketId" to (cursor.getString(bucketIdColumn) ?: "unknown"),
          "bucketName" to (cursor.getString(bucketNameColumn) ?: "Unknown folder"),
          "relativePath" to (if (pathColumn >= 0) cursor.getString(pathColumn) ?: "" else "")
        )
      }
    }
    return tracks
  }
}
