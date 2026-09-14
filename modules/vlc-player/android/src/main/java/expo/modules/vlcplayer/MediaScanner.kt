package expo.modules.vlcplayer

import android.content.ContentUris
import android.content.Context
import android.os.Build
import android.provider.MediaStore

/** Lists every indexed video (internal storage and SD cards) in a single MediaStore query. */
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
}
