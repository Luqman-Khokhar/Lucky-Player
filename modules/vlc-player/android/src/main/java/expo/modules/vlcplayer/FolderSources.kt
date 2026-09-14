package expo.modules.vlcplayer

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.DocumentsContract
import android.provider.DocumentsContract.Document

/**
 * Folders picked through the Storage Access Framework, for videos MediaStore does not index
 * (folders with .nomedia, USB drives, app folders). Read access is persisted per tree.
 */
object FolderSources {
  const val REQUEST_CODE = 7312

  private const val MAX_DEPTH = 12
  private const val MAX_VIDEOS = 20_000

  private val DOCUMENTS_UI_PACKAGES = listOf("com.google.android.documentsui", "com.android.documentsui")

  private val VIDEO_EXTENSIONS = setOf(
    "mkv", "mp4", "m4v", "avi", "mov", "wmv", "flv", "f4v", "webm", "ts", "m2ts", "mts", "3gp", "3g2",
    "mpg", "mpeg", "vob", "ogv", "rm", "rmvb", "divx", "asf", "mxf"
  )

  private val CHILD_PROJECTION = arrayOf(
    Document.COLUMN_DOCUMENT_ID,
    Document.COLUMN_DISPLAY_NAME,
    Document.COLUMN_MIME_TYPE,
    Document.COLUMN_SIZE,
    Document.COLUMN_LAST_MODIFIED
  )

  fun createIntents(): List<Intent> {
    val base = Intent(Intent.ACTION_OPEN_DOCUMENT_TREE).apply {
      addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
    }
    return DOCUMENTS_UI_PACKAGES.map { Intent(base).setPackage(it) } + base
  }

  fun persist(context: Context, treeUri: Uri): Boolean =
    try {
      context.contentResolver.takePersistableUriPermission(treeUri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
      true
    } catch (e: SecurityException) {
      false
    }

  fun release(context: Context, treeUri: Uri) {
    try {
      context.contentResolver.releasePersistableUriPermission(treeUri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
    } catch (_: SecurityException) {
    }
  }

  fun describe(context: Context, treeUri: Uri): Map<String, Any> =
    mapOf("uri" to treeUri.toString(), "name" to rootName(context, treeUri))

  /** Breadth-first walk of the tree. Throws SecurityException when the persisted grant is gone. */
  fun scan(context: Context, treeUri: Uri): List<Map<String, Any>> {
    val granted = context.contentResolver.persistedUriPermissions.any { it.uri == treeUri && it.isReadPermission }
    if (!granted) throw SecurityException("Access to this folder was revoked")

    val videos = ArrayList<Map<String, Any>>()
    val pending = ArrayDeque<Triple<String, String, Int>>() // document id, display path, depth
    pending.add(Triple(DocumentsContract.getTreeDocumentId(treeUri), rootName(context, treeUri), 0))

    while (pending.isNotEmpty() && videos.size < MAX_VIDEOS) {
      val (parentId, parentPath, depth) = pending.removeFirst()
      val childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(treeUri, parentId)
      context.contentResolver.query(childrenUri, CHILD_PROJECTION, null, null, null)?.use { cursor ->
        while (cursor.moveToNext()) {
          val id = cursor.getString(0)
          val name = cursor.getString(1)
          val mime = cursor.getString(2) ?: ""
          if (id == null || name == null) {
            // Provider returned an incomplete row; skip it.
          } else if (mime == Document.MIME_TYPE_DIR) {
            if (depth < MAX_DEPTH && !name.startsWith(".")) pending.add(Triple(id, "$parentPath/$name", depth + 1))
          } else if (isVideo(mime, name)) {
            videos += mapOf(
              "uri" to DocumentsContract.buildDocumentUriUsingTree(treeUri, id).toString(),
              "name" to name,
              "size" to (if (cursor.isNull(3)) 0L else cursor.getLong(3)),
              "modifiedAt" to (if (cursor.isNull(4)) 0L else cursor.getLong(4)),
              "mimeType" to mime,
              "parentId" to parentId,
              "folderName" to parentPath.substringAfterLast('/'),
              "folderPath" to parentPath
            )
          }
        }
      }
    }
    return videos
  }

  private fun isVideo(mime: String, name: String): Boolean =
    mime.startsWith("video/") || name.substringAfterLast('.', "").lowercase() in VIDEO_EXTENSIONS

  private fun rootName(context: Context, treeUri: Uri): String {
    val rootId = DocumentsContract.getTreeDocumentId(treeUri)
    val rootUri = DocumentsContract.buildDocumentUriUsingTree(treeUri, rootId)
    val queried = try {
      context.contentResolver.query(rootUri, arrayOf(Document.COLUMN_DISPLAY_NAME), null, null, null)?.use { cursor ->
        if (cursor.moveToFirst()) cursor.getString(0) else null
      }
    } catch (_: SecurityException) {
      null
    }
    return queried ?: rootId.substringAfterLast(':').substringAfterLast('/').ifEmpty { "Folder" }
  }
}
