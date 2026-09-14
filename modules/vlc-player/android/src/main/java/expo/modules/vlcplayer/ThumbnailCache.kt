package expo.modules.vlcplayer

import android.content.Context
import android.graphics.Bitmap
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.os.Build
import android.util.Size
import java.io.File
import java.io.IOException
import kotlin.math.max

/** JPEG thumbnails on disk, keyed by media id + modification time so edited files regenerate. */
object ThumbnailCache {
  private const val MIN_WIDTH = 64
  private const val MAX_WIDTH = 640
  private const val JPEG_QUALITY = 82
  private const val FRAME_TIME_US = 1_000_000L

  fun get(context: Context, uriString: String, key: String, requestedWidth: Int): String? {
    val width = requestedWidth.coerceIn(MIN_WIDTH, MAX_WIDTH)
    val dir = File(context.cacheDir, "thumbnails").apply { mkdirs() }
    val file = File(dir, "${key.replace(Regex("[^A-Za-z0-9_-]"), "_")}-$width.jpg")
    if (file.length() > 0) return Uri.fromFile(file).toString()

    return try {
      val bitmap = load(context, Uri.parse(uriString), width) ?: return null
      val temp = File(dir, "${file.name}.tmp")
      temp.outputStream().use { bitmap.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, it) }
      bitmap.recycle()
      if (!temp.renameTo(file)) return null
      Uri.fromFile(file).toString()
    } catch (e: IOException) {
      null
    } catch (e: RuntimeException) {
      null // SecurityException, IllegalArgumentException from unreadable or corrupt files
    }
  }

  private fun load(context: Context, uri: Uri, width: Int): Bitmap? {
    if (Build.VERSION.SDK_INT >= 29 && uri.authority == "media") {
      try {
        // Reuses MediaStore's cached thumbnail when one exists: far cheaper than decoding a frame.
        return context.contentResolver.loadThumbnail(uri, Size(width, width * 9 / 16), null)
      } catch (_: IOException) {
      }
    }
    val retriever = MediaMetadataRetriever()
    return try {
      retriever.setDataSource(context, uri)
      val frame = retriever.getFrameAtTime(FRAME_TIME_US, MediaMetadataRetriever.OPTION_CLOSEST_SYNC) ?: return null
      val height = max(1, frame.height * width / max(1, frame.width))
      val scaled = Bitmap.createScaledBitmap(frame, width, height, true)
      if (scaled !== frame) frame.recycle()
      scaled
    } finally {
      try {
        retriever.release()
      } catch (_: Exception) {
      }
    }
  }
}
