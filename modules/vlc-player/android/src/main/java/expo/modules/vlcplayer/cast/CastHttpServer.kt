package expo.modules.vlcplayer.cast

import android.content.Context
import android.util.Log
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.io.IOException
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import java.util.concurrent.RejectedExecutionException
import java.util.concurrent.SynchronousQueue
import java.util.concurrent.ThreadPoolExecutor
import java.util.concurrent.TimeUnit

/**
 * HTTP/1.1 server for the laptop receiver page: serves the page from assets/cast, streams the cast video from
 * /media/<token> with byte ranges, and upgrades /ws to a WebSocket. One instance per casting session; [stop] cannot be
 * undone.
 */
internal class CastHttpServer(
  private val context: Context,
  /** The video for a /media token, or null when that token is not the one being cast. */
  private val mediaFor: (String) -> CastMedia?,
  private val onWebSocket: (CastWebSocket, Request) -> Unit
) {
  class Request(val method: String, val path: String, val headers: Map<String, String>, val remoteAddress: String)

  @Volatile
  private var serverSocket: ServerSocket? = null

  private val connections = ThreadPoolExecutor(0, MAX_CONNECTIONS, 30, TimeUnit.SECONDS, SynchronousQueue()) { runnable ->
    Thread(runnable, "cast-http").apply { isDaemon = true }
  }

  val port: Int
    get() = serverSocket?.localPort ?: 0

  @Throws(IOException::class)
  fun start() {
    val server = bind()
    serverSocket = server
    Thread({ acceptLoop(server) }, "cast-accept").apply { isDaemon = true }.start()
    Log.i(TAG, "Listening on port ${server.localPort}")
  }

  fun stop() {
    try {
      serverSocket?.close()
    } catch (_: IOException) {
    }
    serverSocket = null
    connections.shutdownNow()
  }

  // A fixed port keeps a laptop's bookmark working; the next ports cover another app already using it.
  private fun bind(): ServerSocket {
    var failure: IOException? = null
    for (candidate in PREFERRED_PORT until PREFERRED_PORT + PORT_ATTEMPTS) {
      val server = ServerSocket()
      try {
        server.reuseAddress = true
        server.bind(InetSocketAddress(candidate), BACKLOG)
        return server
      } catch (e: IOException) {
        server.close()
        failure = e
      }
    }
    throw failure ?: IOException("No free port for casting")
  }

  private fun acceptLoop(server: ServerSocket) {
    while (!server.isClosed) {
      val client = try {
        server.accept()
      } catch (_: IOException) {
        break
      }
      try {
        connections.execute { handle(client) }
      } catch (_: RejectedExecutionException) {
        closeQuietly(client)
      }
    }
  }

  private fun handle(client: Socket) {
    try {
      client.soTimeout = REQUEST_TIMEOUT_MS
      client.tcpNoDelay = true
      val input = BufferedInputStream(client.getInputStream())
      val request = readRequest(client, input) ?: return
      when {
        !hostAllowed(request) -> respondText(client, 403, "Open this page by the address shown in Lucky Player.")
        request.method != "GET" && request.method != "HEAD" -> respondText(client, 405, "Method not allowed")
        request.path == WEBSOCKET_PATH -> upgrade(client, input, request)
        request.path.startsWith(MEDIA_PREFIX) -> serveMedia(client, request)
        else -> serveAsset(client, request)
      }
    } catch (e: IOException) {
      Log.d(TAG, "Connection ended: ${e.message}")
    } finally {
      closeQuietly(client)
    }
  }

  private fun readRequest(client: Socket, input: BufferedInputStream): Request? {
    val lines = mutableListOf<String>()
    val line = StringBuilder()
    var total = 0
    while (true) {
      val value = input.read()
      if (value < 0 || ++total > MAX_HEADER_BYTES) return null
      if (value == '\n'.code) {
        val text = line.toString().trimEnd('\r')
        line.setLength(0)
        if (text.isEmpty()) break
        lines += text
      } else {
        line.append(value.toChar())
      }
    }
    val parts = lines.firstOrNull()?.split(' ') ?: return null
    if (parts.size < 3) return null
    val headers = lines.drop(1).mapNotNull { header ->
      val colon = header.indexOf(':')
      if (colon <= 0) null else header.substring(0, colon).trim().lowercase() to header.substring(colon + 1).trim()
    }.toMap()
    return Request(parts[0], parts[1].substringBefore('?'), headers, client.inetAddress?.hostAddress.orEmpty())
  }

  // Only an IP address (or localhost over adb) may name this server. A domain name here means DNS rebinding: a website
  // in the laptop's browser pointing its own name at the phone.
  private fun hostAllowed(request: Request): Boolean {
    val host = request.headers["host"] ?: return false
    return IPV4_HOST.matches(host) || IPV6_HOST.matches(host) || LOCALHOST.matches(host)
  }

  // Blocks other websites open in the laptop's browser from talking to the phone.
  private fun originAllowed(request: Request): Boolean {
    val origin = request.headers["origin"] ?: return false
    val host = request.headers["host"] ?: return false
    return origin == "http://$host"
  }

  private fun upgrade(client: Socket, input: BufferedInputStream, request: Request) {
    val key = request.headers["sec-websocket-key"]
    val isUpgrade = request.headers["upgrade"].equals("websocket", ignoreCase = true)
    if (key == null || !isUpgrade || !originAllowed(request)) {
      respondText(client, 403, "Forbidden")
      return
    }
    val response = "HTTP/1.1 101 Switching Protocols\r\n" +
      "Upgrade: websocket\r\n" +
      "Connection: Upgrade\r\n" +
      "Sec-WebSocket-Accept: ${CastWebSocket.acceptKey(key)}\r\n\r\n"
    client.getOutputStream().apply {
      write(response.toByteArray(Charsets.US_ASCII))
      flush()
    }
    client.soTimeout = WEBSOCKET_IDLE_TIMEOUT_MS
    onWebSocket(CastWebSocket(client, input), request)
  }

  private fun serveAsset(client: Socket, request: Request) {
    val name = ASSETS[request.path] ?: return respondText(client, 404, "Not found")
    val body = try {
      context.assets.open("$ASSET_DIR/$name").use { it.readBytes() }
    } catch (_: IOException) {
      return respondText(client, 404, "Not found")
    }
    val host = request.headers["host"].orEmpty()
    val headers = mapOf(
      "Content-Security-Policy" to "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; " +
        "media-src 'self' blob:; connect-src 'self' ws://$host; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
      "Referrer-Policy" to "no-referrer"
    )
    respond(client, 200, mimeTypeFor(name), body, request.method == "HEAD", headers)
  }

  // Browsers fetch video in byte ranges: one to read the header, more when the user seeks.
  private fun serveMedia(client: Socket, request: Request) {
    val media = mediaFor(request.path.removePrefix(MEDIA_PREFIX)) ?: return respondText(client, 404, "Not found")
    val size = media.size
    val range = parseRange(request.headers["range"], size)
    if (range != null && range.isEmpty()) {
      val head = "HTTP/1.1 416 Range Not Satisfiable\r\nContent-Range: bytes */$size\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
      client.getOutputStream().apply {
        write(head.toByteArray(Charsets.US_ASCII))
        flush()
      }
      return
    }
    val start = range?.first ?: 0L
    val end = range?.last ?: (size - 1)
    val length = end - start + 1
    val input = try {
      media.open(context, start)
    } catch (e: IOException) {
      Log.w(TAG, "Cannot read cast media", e)
      return respondText(client, 500, "Could not read the video on the phone")
    }
    input.use { stream ->
      val head = buildString {
        append(if (range != null) "HTTP/1.1 206 Partial Content\r\n" else "HTTP/1.1 200 OK\r\n")
        append("Content-Type: ${media.mimeType}\r\n")
        append("Content-Length: $length\r\n")
        append("Accept-Ranges: bytes\r\n")
        if (range != null) append("Content-Range: bytes $start-$end/$size\r\n")
        append("Cache-Control: no-store\r\n")
        append("X-Content-Type-Options: nosniff\r\n")
        append("Connection: close\r\n\r\n")
      }
      val output = BufferedOutputStream(client.getOutputStream(), MEDIA_BUFFER_BYTES)
      output.write(head.toByteArray(Charsets.US_ASCII))
      if (request.method != "HEAD") {
        val buffer = ByteArray(MEDIA_BUFFER_BYTES)
        var remaining = length
        while (remaining > 0) {
          val read = stream.read(buffer, 0, minOf(buffer.size.toLong(), remaining).toInt())
          if (read < 0) break
          output.write(buffer, 0, read)
          remaining -= read
        }
      }
      output.flush()
    }
  }

  /** null: the whole file. An empty range: not satisfiable. Only the first of several ranges is served. */
  private fun parseRange(header: String?, size: Long): LongRange? {
    val spec = header?.trim()?.takeIf { it.startsWith("bytes=") }?.removePrefix("bytes=")?.substringBefore(',')?.trim()
      ?: return null
    val dash = spec.indexOf('-')
    if (dash < 0) return LongRange.EMPTY
    val first = spec.substring(0, dash).trim()
    val last = spec.substring(dash + 1).trim()
    val range = if (first.isEmpty()) {
      val suffix = last.toLongOrNull() ?: return LongRange.EMPTY
      (size - suffix).coerceAtLeast(0L) until size
    } else {
      val start = first.toLongOrNull() ?: return LongRange.EMPTY
      start..(last.toLongOrNull()?.coerceAtMost(size - 1) ?: (size - 1))
    }
    return if (range.first < 0 || range.first >= size || range.last < range.first) LongRange.EMPTY else range
  }

  private fun respondText(client: Socket, status: Int, text: String) =
    respond(client, status, "text/plain; charset=utf-8", text.toByteArray(Charsets.UTF_8))

  private fun respond(
    client: Socket,
    status: Int,
    contentType: String,
    body: ByteArray,
    headOnly: Boolean = false,
    headers: Map<String, String> = emptyMap()
  ) {
    val head = buildString {
      append("HTTP/1.1 $status ${REASONS[status] ?: "OK"}\r\n")
      append("Content-Type: $contentType\r\n")
      append("Content-Length: ${body.size}\r\n")
      append("Cache-Control: no-store\r\n")
      append("X-Content-Type-Options: nosniff\r\n")
      append("Connection: close\r\n")
      headers.forEach { (name, value) -> append("$name: $value\r\n") }
      append("\r\n")
    }
    client.getOutputStream().apply {
      write(head.toByteArray(Charsets.US_ASCII))
      if (!headOnly) write(body)
      flush()
    }
  }

  private fun mimeTypeFor(name: String) = when (name.substringAfterLast('.')) {
    "html" -> "text/html; charset=utf-8"
    "js" -> "text/javascript; charset=utf-8"
    "css" -> "text/css; charset=utf-8"
    else -> "application/octet-stream"
  }

  private fun closeQuietly(socket: Socket) {
    try {
      socket.close()
    } catch (_: IOException) {
    }
  }

  companion object {
    private const val TAG = "CastHttpServer"
    const val PREFERRED_PORT = 8686
    private const val PORT_ATTEMPTS = 10
    private const val BACKLOG = 16
    private const val MAX_CONNECTIONS = 16
    private const val MAX_HEADER_BYTES = 8 * 1024
    private const val REQUEST_TIMEOUT_MS = 10_000
    // The page sends a heartbeat every 5 s; three missed beats mean the laptop is gone.
    private const val WEBSOCKET_IDLE_TIMEOUT_MS = 20_000
    private const val WEBSOCKET_PATH = "/ws"
    private const val MEDIA_PREFIX = "/media/"
    private const val MEDIA_BUFFER_BYTES = 256 * 1024
    private const val ASSET_DIR = "cast"

    private val ASSETS = mapOf(
      "/" to "index.html",
      "/index.html" to "index.html",
      "/receiver.js" to "receiver.js",
      "/receiver.css" to "receiver.css"
    )

    private val REASONS = mapOf(
      200 to "OK",
      403 to "Forbidden",
      404 to "Not Found",
      405 to "Method Not Allowed",
      500 to "Internal Server Error"
    )

    private val IPV4_HOST = Regex("""^(\d{1,3}\.){3}\d{1,3}(:\d{1,5})?$""")
    private val IPV6_HOST = Regex("""^\[[0-9a-fA-F:.]+](:\d{1,5})?$""")
    private val LOCALHOST = Regex("""^localhost(:\d{1,5})?$""")
  }
}
