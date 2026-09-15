package expo.modules.vlcplayer

import android.content.ContentUris
import android.content.Context
import android.net.Uri
import android.os.ParcelFileDescriptor
import android.os.SystemClock
import android.provider.DocumentsContract
import android.provider.MediaStore
import android.provider.OpenableColumns
import android.util.Log
import org.videolan.libvlc.LibVLC
import org.videolan.libvlc.Media
import java.io.File
import java.io.IOException

class OpenedMedia(val media: Media, val descriptor: ParcelFileDescriptor?)

/** Process-wide libVLC instance plus source helpers shared by the player view and the probe. */
object VlcEngine {
  private const val TAG = "VlcEngine"

  private const val DEFAULT_SUBTITLE_SCALE = 100
  private const val DEFAULT_SUBTITLE_COLOR = 0xFFFFFF
  private const val SUBTITLE_BACKGROUND_OPACITY = 160

  private val BASE_OPTIONS = listOf(
    "--audio-time-stretch", // pitch-corrected playback speed
    "--avcodec-threads=0"   // software decoder picks thread count per core count
  )

  private val lock = Any()

  @Volatile
  private var libVLC: LibVLC? = null

  // Subtitle look is an instance option, so a style change swaps in a new instance. Guarded by lock.
  private var subtitleOptions: List<String> = subtitleOptionsFor(DEFAULT_SUBTITLE_SCALE, DEFAULT_SUBTITLE_COLOR, false)

  // Open users per instance; a replaced instance is released when its last user finishes. Guarded by lock.
  private val users = HashMap<LibVLC, Int>()

  fun get(context: Context): LibVLC =
    libVLC ?: synchronized(lock) {
      libVLC ?: create(context.applicationContext).also { libVLC = it }
    }

  /** Like [get], but the instance stays usable until [release], even if a style change replaces it meanwhile. */
  fun acquire(context: Context): LibVLC = synchronized(lock) {
    get(context).also { users[it] = (users[it] ?: 0) + 1 }
  }

  fun release(instance: LibVLC) {
    synchronized(lock) {
      val remaining = (users[instance] ?: 1) - 1
      if (remaining > 0) {
        users[instance] = remaining
        return
      }
      users.remove(instance)
      if (instance !== libVLC) instance.release()
    }
  }

  /** Subtitle size (percent), RGB color and background box for videos opened after this call. */
  fun configureSubtitles(context: Context, scale: Int, color: Int, background: Boolean) {
    val options = subtitleOptionsFor(scale, color, background)
    synchronized(lock) {
      if (options == subtitleOptions) return
      subtitleOptions = options
      val previous = libVLC ?: return
      libVLC = null
      if (previous !in users) previous.release()
    }
    warmUp(context)
  }

  private fun create(context: Context): LibVLC {
    val startedAt = SystemClock.elapsedRealtime()
    val instance = try {
      LibVLC(context, ArrayList(BASE_OPTIONS + subtitleOptions))
    } catch (e: IllegalStateException) {
      // An option this libVLC build does not know fails the whole instance; fall back to default subtitles.
      Log.w(TAG, "libVLC rejected subtitle options $subtitleOptions", e)
      LibVLC(context, ArrayList(BASE_OPTIONS))
    }
    Log.i(TAG, "libVLC initialized in ${SystemClock.elapsedRealtime() - startedAt} ms")
    return instance
  }

  private fun subtitleOptionsFor(scale: Int, color: Int, background: Boolean): List<String> = buildList {
    add("--sub-text-scale=${scale.coerceIn(50, 300)}")
    add("--freetype-color=${color and 0xFFFFFF}")
    if (background) {
      add("--freetype-background-opacity=$SUBTITLE_BACKGROUND_OPACITY")
      add("--freetype-background-color=0")
    }
  }

  /** Creates the engine on a background thread so the first video does not pay for libVLC startup. */
  fun warmUp(context: Context) {
    if (libVLC != null) return
    val appContext = context.applicationContext
    Thread({ get(appContext) }, "vlc-warmup").apply { isDaemon = true }.start()
  }

  /**
   * content:// URIs (document picker, MediaStore, SAF) are opened as file descriptors because
   * libVLC cannot resolve them itself. The descriptor must stay open for the whole playback.
   */
  @Throws(IOException::class)
  fun openMedia(context: Context, libVLC: LibVLC, source: String): OpenedMedia {
    val uri = Uri.parse(source)
    return when (uri.scheme?.lowercase()) {
      "content" -> {
        val descriptor = openContentDescriptor(context, uri) ?: throw IOException("Cannot open $source")
        OpenedMedia(Media(libVLC, descriptor.fileDescriptor), descriptor)
      }
      null, "" -> OpenedMedia(Media(libVLC, source), null)
      "file" -> OpenedMedia(Media(libVLC, uri.path ?: source), null)
      else -> OpenedMedia(Media(libVLC, uri), null)
    }
  }

  /**
   * Document URIs are readable only with a grant from the picker. When that grant is missing
   * (picker app forwarded none, or the app restarted without a persisted grant), retry through
   * MediaStore, which READ_MEDIA_VIDEO covers.
   */
  private fun openContentDescriptor(context: Context, uri: Uri): ParcelFileDescriptor? =
    try {
      context.contentResolver.openFileDescriptor(uri, "r")
    } catch (e: SecurityException) {
      val fallback = mediaStoreUriFor(context, uri) ?: throw e
      context.contentResolver.openFileDescriptor(fallback, "r")
    }

  private fun mediaStoreUriFor(context: Context, uri: Uri): Uri? {
    if (!DocumentsContract.isDocumentUri(context, uri)) return null
    val documentId = DocumentsContract.getDocumentId(uri)
    val type = documentId.substringBefore(':')
    val value = documentId.substringAfter(':', "")
    return when (uri.authority) {
      "com.android.providers.media.documents" -> {
        val id = value.toLongOrNull() ?: return null
        when (type) {
          "video" -> ContentUris.withAppendedId(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, id)
          "audio" -> ContentUris.withAppendedId(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, id)
          else -> null
        }
      }
      "com.android.providers.downloads.documents" -> when (type) {
        "raw" -> Uri.fromFile(File(value))
        "msf" -> value.toLongOrNull()?.let { ContentUris.withAppendedId(MediaStore.Files.getContentUri("external"), it) }
        else -> null
      }
      else -> null
    }
  }

  /** libVLC slaves need a real path; copy picked subtitle documents into the cache first. */
  fun copySubtitleToCache(context: Context, uri: Uri): Uri? {
    return try {
      val name = displayName(context, uri) ?: "subtitle.srt"
      val dir = File(context.cacheDir, "subtitles").apply { mkdirs() }
      val file = File(dir, name.replace(Regex("[^A-Za-z0-9._-]"), "_"))
      val input = context.contentResolver.openInputStream(uri) ?: return null
      input.use { stream -> file.outputStream().use { stream.copyTo(it) } }
      Uri.fromFile(file)
    } catch (e: IOException) {
      null
    }
  }

  private fun displayName(context: Context, uri: Uri): String? =
    context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
      if (cursor.moveToFirst()) cursor.getString(0) else null
    }
}
