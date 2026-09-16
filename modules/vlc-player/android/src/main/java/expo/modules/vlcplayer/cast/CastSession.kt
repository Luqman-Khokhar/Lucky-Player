package expo.modules.vlcplayer.cast

import android.content.Context
import android.media.MediaExtractor
import android.media.MediaFormat
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.util.Log
import org.json.JSONException
import org.json.JSONObject
import java.io.IOException
import java.security.SecureRandom
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit

/**
 * Casting state shared by the app, the service and the server: running server, pairing, connected laptops and the
 * video one of them plays. Thread-safe; [listener] and [playbackListener] are called on the main thread.
 */
object CastSession {
  private const val TAG = "CastSession"
  private const val TICK_MS = 5_000L
  private const val MAX_RECEIVERS = 4
  private val PLAYBACK_STATUSES = setOf("loading", "blocked", "buffering", "playing", "paused", "ended", "error")
  // MEDIA_ERR_DECODE and MEDIA_ERR_SRC_NOT_SUPPORTED from the laptop's video element.
  private val DECODE_ERROR_CODES = setOf(3, 4)

  class NoNetworkException : Exception("No Wi-Fi or hotspot network")

  class CastException(val code: String, message: String) : Exception(message)

  internal class Receiver(
    val id: String,
    val name: String,
    val browser: String,
    val os: String,
    val capabilities: JSONObject,
    val connectedAt: Long,
    val socket: CastWebSocket
  ) {
    /** Codecs this browser said it could play but then failed on; they are converted from now on. */
    val blockedCodecs: MutableSet<String> = java.util.Collections.synchronizedSet(HashSet())
  }

  /** The video a laptop plays. Mutable fields are guarded by lock and come from the laptop's reports. */
  private class Active(
    val receiverId: String,
    val receiverName: String,
    val media: CastMedia,
    val token: String,
    val videoMime: String?,
    val audioMime: String?,
    var convert: Boolean,
    var status: String,
    var positionMs: Long,
    var durationMs: Long = 0L,
    var error: String? = null,
    /** Where the converted stream starts; the laptop's own clock runs from zero. */
    var streamStartMs: Long = 0L,
    var transcode: TranscodeSession? = null
  )

  @Volatile
  var listener: ((Map<String, Any?>) -> Unit)? = null

  @Volatile
  var playbackListener: ((Map<String, Any?>?) -> Unit)? = null

  private val lock = Any()
  private val mainHandler = Handler(Looper.getMainLooper())
  private val random = SecureRandom()

  // Guarded by lock.
  private var appContext: Context? = null
  private var server: CastHttpServer? = null
  private var pairing: CastPairing? = null
  private var address: CastNetwork.LocalAddress? = null
  private var ticker: ScheduledExecutorService? = null
  private val receivers = LinkedHashMap<String, Receiver>()
  private var active: Active? = null
  // Converters wait here to be stopped off the lock; stopping one joins its thread.
  private val stopping = ArrayDeque<TranscodeSession>()

  @Throws(IOException::class, NoNetworkException::class)
  fun start(context: Context): Map<String, Any?> {
    val app = context.applicationContext
    synchronized(lock) {
      if (server != null) return snapshotLocked()
      val local = CastNetwork.localAddress(app) ?: throw NoNetworkException()
      val http = CastHttpServer(app, { token -> mediaFor(token) }) { socket, request -> serveReceiver(socket, request) }
      http.start()
      appContext = app
      server = http
      address = local
      pairing = (pairing ?: CastPairing(app)).also { it.renewCode() }
      ticker = Executors.newSingleThreadScheduledExecutor { runnable ->
        Thread(runnable, "cast-ticker").apply { isDaemon = true }
      }.also { it.scheduleWithFixedDelay({ tick() }, TICK_MS, TICK_MS, TimeUnit.MILLISECONDS) }
    }
    Log.i(TAG, "Casting started")
    CastService.start(app)
    emit()
    return snapshot()
  }

  fun stop(context: Context) {
    var session: TranscodeSession? = null
    val closing = synchronized(lock) {
      val http = server ?: return
      server = null
      session = active?.transcode
      active = null
      ticker?.shutdownNow()
      ticker = null
      http.stop()
      receivers.values.toList().also { receivers.clear() }
    }
    session?.stop()
    val bye = message("bye", "reason" to "stopped")
    closing.forEach {
      it.socket.sendText(bye)
      it.socket.close()
    }
    Log.i(TAG, "Casting stopped")
    CastService.stop(context.applicationContext)
    emit()
    emitPlayback()
  }

  /** Every laptop has to enter the code again; connected ones are disconnected. */
  fun forgetReceivers(context: Context) {
    val closing = synchronized(lock) {
      (pairing ?: CastPairing(context).also { pairing = it }).forgetAll()
      receivers.values.toList().also { receivers.clear() }
    }
    closing.forEach { it.socket.close() }
    emit()
    emitPlayback()
  }

  fun snapshot(): Map<String, Any?> = synchronized(lock) { snapshotLocked() }

  private fun snapshotLocked(): Map<String, Any?> {
    val http = server
    val local = address.takeIf { http != null }
    return mapOf(
      "running" to (http != null),
      "address" to if (http != null && local != null) "http://${local.ip}:${http.port}" else null,
      "network" to local?.kind?.id,
      "code" to pairing?.code?.takeIf { http != null },
      "receivers" to receivers.values.map {
        mapOf(
          "id" to it.id,
          "name" to it.name,
          "browser" to it.browser,
          "os" to it.os,
          "connectedAt" to it.connectedAt.toDouble()
        )
      }
    )
  }

  // region Playback

  /**
   * Sends a video to a connected laptop, replacing what any laptop was playing. Blocking (probes the file); call off
   * the main thread.
   */
  @Throws(CastException::class)
  fun castMedia(context: Context, receiverId: String, uri: String, title: String, startMs: Long) {
    val app = context.applicationContext
    val receiver = synchronized(lock) { receivers[receiverId] }
      ?: throw CastException("ERR_NO_RECEIVER", "That laptop is no longer connected. Open the Cast screen to connect it again.")
    val media = try {
      CastMedia.describe(app, uri, title)
    } catch (e: IOException) {
      Log.w(TAG, "Cannot open $uri for casting", e)
      throw CastException("ERR_OPEN", "Couldn't open this video for casting. Check that the file still exists.")
    }
    val tracks = CodecPlanner.readTracks(app, media)
    val plan = CodecPlanner.plan(media, tracks, receiver.capabilities, receiver.blockedCodecs)
    Log.i(TAG, "Plan ${media.mimeType} video=${tracks?.video} audio=${tracks?.audio} mode=${plan.mode} ${plan.blocker}")
    if (plan.mode == CodecPlanner.Mode.REFUSE) {
      val browser = receiver.browser.ifEmpty { "This browser" }
      throw CastException("ERR_UNSUPPORTED", "$browser can't play ${plan.blocker}, and this phone can't convert it either.")
    }
    val convert = plan.mode == CodecPlanner.Mode.CONVERT
    // A converted stream has no length of its own, so the phone measures the file up front.
    val durationMs = if (convert) checkConvertible(app, media) else 0L

    val next = Active(
      receiverId, receiver.name, media, newToken(), tracks?.video, tracks?.audio, convert, "loading",
      startMs.coerceAtLeast(0L), durationMs
    )
    val previous = synchronized(lock) {
      val replaced = active
      active = next
      replaced?.transcode?.let { stopping.add(it) }
      replaced?.takeIf { it.receiverId != receiverId }?.let { receivers[it.receiverId] }
    }
    stopPendingTranscodes()
    previous?.socket?.sendText(message("stop"))
    Log.i(TAG, "Casting ${media.mimeType} (${media.size} bytes) ${if (convert) "converted" else "as it is"} to ${receiver.name}")
    if (convert) startTranscode(app, receiver, next) else sendLoad(receiver, next)
    emitPlayback()
  }

  /** The video's length in milliseconds. Refuses what the converter cannot handle: scaling down needs an OpenGL pass it does not have yet. */
  @Throws(CastException::class)
  private fun checkConvertible(context: Context, media: CastMedia): Long {
    val extractor = MediaExtractor()
    try {
      TranscodeSession.openSource(extractor, context, media)
      val index = TranscodeSession.trackIndex(extractor, "video/")
      if (index < 0) throw CastException("ERR_UNSUPPORTED", "This file has no video track to cast.")
      val format = extractor.getTrackFormat(index)
      val pixels = format.getInteger(MediaFormat.KEY_WIDTH) * format.getInteger(MediaFormat.KEY_HEIGHT)
      if (pixels > TranscodeSession.MAX_PIXELS) {
        throw CastException(
          "ERR_TOO_LARGE",
          "This video is larger than Full HD, which this phone can't convert for the laptop yet."
        )
      }
      val durationUs = if (format.containsKey(MediaFormat.KEY_DURATION)) format.getLong(MediaFormat.KEY_DURATION) else 0L
      return durationUs / 1000L
    } catch (e: IOException) {
      throw CastException("ERR_OPEN", "Couldn't read this video for casting.")
    } finally {
      runCatching { extractor.release() }
    }
  }

  private fun startTranscode(context: Context, receiver: Receiver, item: Active) {
    val session = TranscodeSession(context, item.media, item.positionMs * 1000L, object : TranscodeSession.Listener {
      override fun onInitSegment(mimeType: String, data: ByteArray) {
        val target = currentReceiver(item) ?: return
        target.socket.sendText(
          message(
            "load",
            "kind" to "stream",
            "token" to item.token,
            "mimeType" to mimeType,
            "title" to item.media.title,
            "startMs" to item.streamStartMs,
            "durationMs" to synchronized(lock) { item.durationMs }
          )
        )
        target.socket.sendBinary(data)
      }

      override fun onFragment(data: ByteArray) {
        currentReceiver(item)?.socket?.sendBinary(data)
      }

      override fun onEnded() {
        currentReceiver(item)?.socket?.sendText(message("stream_end"))
      }

      override fun onError(errorMessage: String) {
        val changed = synchronized(lock) {
          if (active !== item) return@synchronized false
          item.status = "error"
          item.error = errorMessage
          true
        }
        if (changed) emitPlayback()
      }
    })
    synchronized(lock) {
      item.streamStartMs = item.positionMs
      item.transcode = session
    }
    session.start()
  }

  /** Null once this video is no longer the one being cast, or while its laptop is away. */
  private fun currentReceiver(item: Active): Receiver? = synchronized(lock) {
    if (active !== item) null else receivers[item.receiverId]
  }

  private fun stopPendingTranscodes() {
    while (true) {
      val session = synchronized(lock) { stopping.removeFirstOrNull() } ?: return
      session.stop()
    }
  }

  /** play, pause, seek (to [positionMs]) or stop for the video being cast. */
  fun castControl(action: String, positionMs: Long) {
    val (current, receiver, context) = synchronized(lock) {
      val playing = active ?: return
      Triple(playing, receivers[playing.receiverId], appContext)
    }
    when (action) {
      "play", "pause" -> receiver?.socket?.sendText(message(action))
      "seek" -> {
        val target = positionMs.coerceAtLeast(0L)
        if (current.convert) {
          if (context != null && receiver != null) restartTranscode(context, receiver, current, target)
        } else {
          synchronized(lock) { current.positionMs = target }
          receiver?.socket?.sendText(message("seek", "ms" to target))
        }
      }
      "stop" -> {
        var session: TranscodeSession? = null
        synchronized(lock) {
          if (active === current) {
            session = current.transcode
            current.transcode = null
            active = null
          }
        }
        session?.stop()
        receiver?.socket?.sendText(message("stop"))
        emitPlayback()
      }
    }
  }

  /** A converted stream has only what the laptop already received, so seeking converts again from the new position. */
  private fun restartTranscode(context: Context, receiver: Receiver, item: Active, positionMs: Long) {
    val previous = synchronized(lock) {
      item.positionMs = positionMs
      item.status = "loading"
      item.transcode.also { item.transcode = null }
    }
    previous?.stop()
    receiver.socket.sendText(message("stop"))
    startTranscode(context, receiver, item)
    emitPlayback()
  }

  fun playbackSnapshot(): Map<String, Any?>? = synchronized(lock) {
    val current = active ?: return@synchronized null
    val connected = receivers.containsKey(current.receiverId)
    mapOf(
      "receiverId" to current.receiverId,
      "receiverName" to current.receiverName,
      "uri" to current.media.uri,
      "title" to current.media.title,
      "status" to if (connected) current.status else "disconnected",
      "positionMs" to current.positionMs.toDouble(),
      "durationMs" to current.durationMs.toDouble(),
      "error" to current.error
    )
  }

  internal fun mediaFor(token: String): CastMedia? = synchronized(lock) { active?.takeIf { it.token == token }?.media }

  private fun sendLoad(receiver: Receiver, item: Active) {
    val positionMs = synchronized(lock) { item.positionMs }
    receiver.socket.sendText(
      message(
        "load",
        "kind" to "direct",
        "token" to item.token,
        "url" to "/media/${item.token}",
        "mimeType" to item.media.mimeType,
        "title" to item.media.title,
        "startMs" to positionMs
      )
    )
  }

  private fun onReceiverState(receiver: Receiver, report: JSONObject) {
    val status = report.optString("status")
    if (status !in PLAYBACK_STATUSES) return
    // canPlayType was too optimistic: this laptop cannot really decode the file, so convert it instead.
    if (status == "error" && report.optInt("errorCode") in DECODE_ERROR_CODES) {
      val retried = retryAsConvert(receiver, report.optString("token"))
      if (retried) return
    }
    var transcode: TranscodeSession? = null
    synchronized(lock) {
      val current = active ?: return
      if (current.receiverId != receiver.id || report.optString("token") != current.token) return
      current.status = status
      // A converted stream runs from zero on the laptop, so its reports are relative to where conversion started.
      val reported = report.optLong("positionMs", 0L).coerceAtLeast(0L)
      current.positionMs = if (current.convert) current.streamStartMs + reported else reported
      if (!current.convert) current.durationMs = report.optLong("durationMs", current.durationMs).coerceAtLeast(0L)
      current.error = report.optString("error").takeIf { status == "error" && it.isNotEmpty() }?.take(200)
      transcode = current.transcode
    }
    transcode?.setBufferedAhead(report.optLong("bufferedAheadMs", 0L).coerceAtLeast(0L))
    emitPlayback()
  }

  // endregion

  // region Receiver connection (one server thread per laptop, blocking)

  private fun serveReceiver(socket: CastWebSocket, request: CastHttpServer.Request) {
    var hello: JSONObject? = null
    var receiver: Receiver? = null
    try {
      while (true) {
        val text = socket.readText() ?: break
        val incoming = try {
          JSONObject(text)
        } catch (_: JSONException) {
          continue
        }
        when (incoming.optString("type")) {
          "hello" -> if (receiver == null) {
            hello = incoming
            receiver = onHello(socket, incoming)
          }
          "pair" -> if (receiver == null) {
            receiver = hello?.let { onPair(socket, request, it, incoming.optString("code").trim()) }
          }
          "state" -> receiver?.let { onReceiverState(it, incoming) }
          // The laptop page's own controls; a converted stream seeks through the phone.
          "control" -> receiver?.let { onReceiverControl(it, incoming) }
          "heartbeat" -> Unit
        }
      }
    } catch (e: IOException) {
      Log.i(TAG, "Laptop connection ended: ${e.message}")
    } finally {
      socket.close()
      receiver?.let { remove(it) }
    }
  }

  /** False when there is nothing to retry: another video, already converting, or the phone cannot convert this one. */
  private fun retryAsConvert(receiver: Receiver, token: String): Boolean {
    val (item, context) = synchronized(lock) {
      val current = active ?: return false
      if (current.receiverId != receiver.id || current.token != token || current.convert) return false
      current to appContext
    }
    if (context == null) return false
    item.videoMime?.let { receiver.blockedCodecs.add(it) }
    val durationMs = try {
      checkConvertible(context, item.media)
    } catch (e: CastException) {
      synchronized(lock) {
        item.status = "error"
        item.error = e.message
      }
      emitPlayback()
      return true
    }
    Log.i(TAG, "${receiver.name} could not decode ${item.videoMime}; converting instead")
    synchronized(lock) {
      item.convert = true
      item.durationMs = durationMs
      item.status = "loading"
      item.error = null
    }
    receiver.socket.sendText(message("stop"))
    startTranscode(context, receiver, item)
    emitPlayback()
    return true
  }

  private fun onReceiverControl(receiver: Receiver, control: JSONObject) {
    val playing = synchronized(lock) { active?.takeIf { it.receiverId == receiver.id && it.token == control.optString("token") } }
    if (playing == null) return
    castControl(control.optString("action"), control.optLong("ms", 0L))
  }

  private fun onHello(socket: CastWebSocket, hello: JSONObject): Receiver? {
    val current = synchronized(lock) { pairing } ?: return null
    val token: String? = hello.optString("token", null)
    if (token != null && current.isPaired(token)) return accept(socket, hello, current.receiverId(token))
    socket.sendText(message("need_code"))
    return null
  }

  private fun onPair(socket: CastWebSocket, request: CastHttpServer.Request, hello: JSONObject, code: String): Receiver? {
    val current = synchronized(lock) { pairing } ?: return null
    return when (val result = current.pair(code, request.remoteAddress, receiverName(hello))) {
      is CastPairing.Result.Paired -> {
        socket.sendText(message("paired", "token" to result.token))
        accept(socket, hello, current.receiverId(result.token))
      }
      is CastPairing.Result.Refused -> {
        socket.sendText(message("pair_failed", "retryAfterMs" to result.retryAfterMs))
        // Too many wrong codes renews the code; the app has to show the new one.
        emit()
        null
      }
    }
  }

  private fun accept(socket: CastWebSocket, hello: JSONObject, id: String): Receiver? {
    val receiver = Receiver(
      id = id,
      name = receiverName(hello),
      browser = clean(hello.optString("browser")),
      os = clean(hello.optString("os")),
      capabilities = hello.optJSONObject("capabilities") ?: JSONObject(),
      connectedAt = System.currentTimeMillis(),
      socket = socket
    )
    var replaced: Receiver? = null
    var resume: Active? = null
    val context = synchronized(lock) {
      if (server == null) return null
      replaced = receivers[id]
      if (replaced == null && receivers.size >= MAX_RECEIVERS) {
        socket.sendText(message("busy", "max" to MAX_RECEIVERS))
        return null
      }
      receivers[id] = receiver
      resume = active?.takeIf { it.receiverId == id }
      appContext
    }
    // The same laptop reconnected before its old connection timed out.
    replaced?.socket?.close()
    socket.sendText(message("welcome", "receiverId" to id, "phoneName" to phoneName(context)))
    // Reconnected mid-video: a direct stream continues where it was, a converted one starts again from there.
    resume?.let { item ->
      if (item.convert) context?.let { restartTranscode(it, receiver, item, item.positionMs) } else sendLoad(receiver, item)
    }
    Log.i(TAG, "Laptop connected: ${receiver.name}")
    emit()
    if (resume != null) emitPlayback()
    return receiver
  }

  private fun remove(receiver: Receiver) {
    var session: TranscodeSession? = null
    val (removed, wasPlaying) = synchronized(lock) {
      val gone = receivers.remove(receiver.id, receiver)
      val playing = active?.receiverId == receiver.id
      // Nothing to send the fragments to; converting again would only heat the phone.
      if (gone && playing) {
        session = active?.transcode
        active?.transcode = null
      }
      gone to playing
    }
    session?.stop()
    if (!removed) return
    Log.i(TAG, "Laptop disconnected: ${receiver.name}")
    emit()
    if (wasPlaying) emitPlayback()
  }

  // endregion

  private fun tick() {
    val (targets, context) = synchronized(lock) { receivers.values.toList() to appContext }
    val beat = message("heartbeat")
    targets.forEach { if (!it.socket.sendText(beat)) remove(it) }
    context ?: return
    // The phone can move to another Wi-Fi or turn its hotspot on or off while casting.
    val latest = CastNetwork.localAddress(context)
    val changed = synchronized(lock) {
      if (server == null || latest == address) return@synchronized false
      address = latest
      true
    }
    if (changed) emit()
  }

  private fun emit() {
    val state = snapshot()
    val context = synchronized(lock) { appContext }
    if (context != null && state["running"] == true) CastNotification.update(context, state)
    mainHandler.post { listener?.invoke(state) }
  }

  private fun emitPlayback() {
    val playback = playbackSnapshot()
    mainHandler.post { playbackListener?.invoke(playback) }
  }

  private fun newToken(): String = ByteArray(16).also { random.nextBytes(it) }.joinToString("") { "%02x".format(it) }

  private fun receiverName(hello: JSONObject): String =
    listOf(clean(hello.optString("browser")), clean(hello.optString("os")))
      .filter { it.isNotEmpty() && it != "Unknown" }
      .joinToString(" · ")
      .ifEmpty { "Laptop browser" }

  private fun clean(value: String) = value.replace(Regex("[^\\p{L}\\p{N} ._-]"), "").trim().take(24)

  private fun phoneName(context: Context?): String {
    val name = if (context != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.N_MR1) {
      Settings.Global.getString(context.contentResolver, Settings.Global.DEVICE_NAME)
    } else {
      null
    }
    return name?.takeIf { it.isNotBlank() } ?: Build.MODEL
  }

  private fun message(type: String, vararg fields: Pair<String, Any?>): String =
    JSONObject().put("type", type).apply { fields.forEach { (key, value) -> put(key, value) } }.toString()
}
