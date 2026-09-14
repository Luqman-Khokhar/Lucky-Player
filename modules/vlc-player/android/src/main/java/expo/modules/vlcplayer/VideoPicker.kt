package expo.modules.vlcplayer

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.OpenableColumns

/**
 * System document picker for videos. Unlike expo-document-picker it targets DocumentsUI directly
 * (XOS routes OPEN_DOCUMENT to Google Drive, whose results for local files carry no read grant)
 * and persists the read grant so resume works after the app restarts.
 */
object VideoPicker {
  const val REQUEST_CODE = 7311

  private val DOCUMENTS_UI_PACKAGES = listOf("com.google.android.documentsui", "com.android.documentsui")

  // Android often labels MKV/AVI/FLV/RMVB as octet-stream or vendor types, so video/* alone hides them.
  private val MIME_TYPES = arrayOf(
    "video/*",
    "application/x-matroska",
    "application/octet-stream",
    "application/vnd.rn-realmedia",
    "application/vnd.rn-realmedia-vbr",
    "application/ogg",
    "application/mxf"
  )

  fun createIntents(): List<Intent> {
    val base = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
      addCategory(Intent.CATEGORY_OPENABLE)
      type = "*/*"
      putExtra(Intent.EXTRA_MIME_TYPES, MIME_TYPES)
      addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
    }
    // Try each DocumentsUI package explicitly, then fall back to whatever the system resolves.
    return DOCUMENTS_UI_PACKAGES.map { Intent(base).setPackage(it) } + base
  }

  fun persistReadAccess(context: Context, uri: Uri): Boolean =
    try {
      context.contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
      true
    } catch (e: SecurityException) {
      false
    }

  fun describe(context: Context, uri: Uri, persisted: Boolean): Map<String, Any> {
    var name = uri.lastPathSegment ?: "Video"
    var size = -1L
    try {
      context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)
        ?.use { cursor ->
          if (cursor.moveToFirst()) {
            if (!cursor.isNull(0)) name = cursor.getString(0)
            if (!cursor.isNull(1)) size = cursor.getLong(1)
          }
        }
    } catch (_: SecurityException) {
    }
    return mapOf(
      "uri" to uri.toString(),
      "name" to name,
      "size" to size,
      "mimeType" to (context.contentResolver.getType(uri) ?: ""),
      "persisted" to persisted
    )
  }
}
