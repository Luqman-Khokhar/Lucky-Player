package expo.modules.vlcplayer.cast

import android.content.Context
import android.net.Uri
import android.os.ParcelFileDescriptor
import android.webkit.MimeTypeMap
import expo.modules.vlcplayer.VlcEngine
import java.io.File
import java.io.FileInputStream
import java.io.IOException

/** A local video file a laptop streams directly: content:// (MediaStore, SAF) or a file path. */
internal class CastMedia(val uri: String, val title: String, val mimeType: String, val size: Long) {
  /** Opens the file positioned at [offset] bytes. The caller closes the stream. */
  @Throws(IOException::class)
  fun open(context: Context, offset: Long): FileInputStream {
    val stream = openStream(context, uri)
    try {
      if (offset > 0) stream.channel.position(offset)
    } catch (e: IOException) {
      stream.close()
      throw e
    }
    return stream
  }

  companion object {
    @Throws(IOException::class)
    fun describe(context: Context, uri: String, title: String): CastMedia {
      val parsed = Uri.parse(uri)
      val size: Long
      val mimeType: String
      if (parsed.scheme.equals("content", ignoreCase = true)) {
        size = openDescriptor(context, parsed).use { it.statSize }
        mimeType = context.contentResolver.getType(parsed) ?: mimeTypeFromName(title)
      } else {
        val file = File(parsed.path ?: uri)
        if (!file.canRead()) throw IOException("Cannot read $uri")
        size = file.length()
        mimeType = mimeTypeFromName(file.name)
      }
      if (size <= 0) throw IOException("Unknown size for $uri")
      return CastMedia(uri, title, mimeType.lowercase(), size)
    }

    private fun openStream(context: Context, uri: String): FileInputStream {
      val parsed = Uri.parse(uri)
      return when (parsed.scheme?.lowercase()) {
        "content" -> ParcelFileDescriptor.AutoCloseInputStream(openDescriptor(context, parsed))
        "file" -> FileInputStream(parsed.path ?: throw IOException("Bad file URI $uri"))
        null, "" -> FileInputStream(uri)
        else -> throw IOException("Unsupported source $uri")
      }
    }

    private fun openDescriptor(context: Context, uri: Uri): ParcelFileDescriptor =
      try {
        VlcEngine.openContentDescriptor(context, uri) ?: throw IOException("Cannot open $uri")
      } catch (e: SecurityException) {
        throw IOException("No permission to read $uri", e)
      }

    private fun mimeTypeFromName(name: String): String {
      val extension = name.substringAfterLast('.', "").lowercase()
      return MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension) ?: "application/octet-stream"
    }
  }
}
