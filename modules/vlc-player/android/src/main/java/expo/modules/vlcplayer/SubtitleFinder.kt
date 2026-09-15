package expo.modules.vlcplayer

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.DocumentsContract
import android.provider.DocumentsContract.Document
import android.util.Log
import java.io.File

/**
 * Subtitle files for a video: the system picker for any file, and discovery of files next to the video with
 * the same base name (movie.srt, movie.en.srt). Discovery needs a listable folder: file paths and folders added
 * through the folder picker. Scoped storage hides non-media files from MediaStore, so videos known only through
 * MediaStore get no automatic subtitles.
 */
object SubtitleFinder {
  const val REQUEST_CODE = 7313

  private const val TAG = "SubtitleFinder"
  private const val EXTERNAL_STORAGE_AUTHORITY = "com.android.externalstorage.documents"

  private val EXTENSIONS = setOf("srt", "ass", "ssa", "vtt", "sub", "smi")
  private val DOCUMENTS_UI_PACKAGES = listOf("com.google.android.documentsui", "com.android.documentsui")

  fun createPickerIntents(): List<Intent> {
    val base = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
      addCategory(Intent.CATEGORY_OPENABLE)
      // Subtitle files rarely carry a useful MIME type.
      type = "*/*"
      addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
    }
    return DOCUMENTS_UI_PACKAGES.map { Intent(base).setPackage(it) } + base
  }

  /** A URI libVLC can open; content documents are copied into the cache. Null when unreadable. */
  fun resolve(context: Context, uri: String): Uri? {
    val parsed = Uri.parse(uri)
    return try {
      if (parsed.scheme == "content") VlcEngine.copySubtitleToCache(context, parsed) else parsed
    } catch (e: SecurityException) {
      Log.w(TAG, "No access to $uri", e)
      null
    }
  }

  /** Blocking; call off the main thread. */
  fun findSidecars(context: Context, source: String): List<Uri> {
    return try {
      val uri = Uri.parse(source)
      when (uri.scheme?.lowercase()) {
        null, "" -> fromDirectory(File(source))
        "file" -> uri.path?.let { fromDirectory(File(it)) } ?: emptyList()
        "content" -> fromDocumentTree(context, uri)
        else -> emptyList()
      }
    } catch (e: Exception) {
      Log.w(TAG, "Sidecar lookup failed for $source", e)
      emptyList()
    }
  }

  private fun fromDirectory(video: File): List<Uri> {
    val base = video.nameWithoutExtension
    val files = video.parentFile?.listFiles() ?: return emptyList()
    return files.filter { it.isFile && matches(base, it.name) }.sortedBy { it.name }.map { Uri.fromFile(it) }
  }

  private fun fromDocumentTree(context: Context, video: Uri): List<Uri> {
    val isTreeDocument = DocumentsContract.isDocumentUri(context, video) && video.pathSegments.firstOrNull() == "tree"
    // Only the external storage provider encodes the folder in the document id ("primary:Movies/film.mkv").
    if (!isTreeDocument || video.authority != EXTERNAL_STORAGE_AUTHORITY) return emptyList()
    val documentId = DocumentsContract.getDocumentId(video)
    val parentId =
      if (documentId.contains('/')) documentId.substringBeforeLast('/') else "${documentId.substringBefore(':')}:"
    val base = documentId.substringAfterLast('/').substringAfterLast(':').substringBeforeLast('.')
    val treeUri = DocumentsContract.buildTreeDocumentUri(video.authority, DocumentsContract.getTreeDocumentId(video))
    val children = DocumentsContract.buildChildDocumentsUriUsingTree(treeUri, parentId)

    val found = mutableListOf<Pair<String, Uri>>()
    val projection = arrayOf(Document.COLUMN_DOCUMENT_ID, Document.COLUMN_DISPLAY_NAME)
    context.contentResolver.query(children, projection, null, null, null)?.use { cursor ->
      while (cursor.moveToNext()) {
        val id = cursor.getString(0)
        val name = cursor.getString(1)
        if (id != null && name != null && matches(base, name)) {
          found += name to DocumentsContract.buildDocumentUriUsingTree(treeUri, id)
        }
      }
    }
    return found.sortedBy { it.first }.mapNotNull { VlcEngine.copySubtitleToCache(context, it.second) }
  }

  private fun matches(videoBase: String, name: String): Boolean {
    if (name.substringAfterLast('.', "").lowercase() !in EXTENSIONS) return false
    val stem = name.substringBeforeLast('.')
    return stem.equals(videoBase, ignoreCase = true) || stem.startsWith("$videoBase.", ignoreCase = true)
  }
}
