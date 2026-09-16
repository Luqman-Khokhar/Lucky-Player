package expo.modules.vlcplayer.cast

import android.content.Context
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMetadataRetriever
import android.media.projection.MediaProjection
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.util.Log
import expo.modules.vlcplayer.VlcEngine
import org.json.JSONException
import org.json.JSONObject
import java.io.IOException
import java.security.SecureRandom
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit

/**
 * Casting state shared by the app, the service and the server: the running server, the laptops connected to it, and
 * what they are watching.
 *
 * One video plays on every laptop the phone has allowed. Each of them reports back, so the phone knows how far the
 * furthest has got and how much the slowest has buffered. Thread-safe; [listener] and [playbackListener] are called
 * on the main thread.
 */
object CastSession {
  private const val TAG = "CastSession"
  private const val TICK_MS = 5_000L
  private const val MAX_RECEIVERS = 4
  private val PLAYBACK_STATUSES = setOf("loading", "blocked", "buffering", "playing", "paused", "ended", "error")
  // MEDIA_ERR_DECODE and MEDIA_ERR_SRC_NOT_SUPPORTED from a laptop's video element.
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

    @Volatile
    var allowed = false

    @Volatile
    var canControl = false
  }

  /** What one laptop last said about the video it is showing. */
  private class Report(
    var status: String = "loading",
    var positionMs: Long = 0L,
    var durationMs: Long = 0L,
    var bufferedAheadMs: Long = 0L,
    var seekable: Boolean = true,
    var error: String? = null
  )

  /**
   * What is being cast: a video file, or the mirrored phone screen ([media] null). Mutable fields are guarded by lock.
   */
  private class Active(
    val title: String,
    val uri: String,
    val media: CastMedia?,
    val token: String,
    val videoMime: String?,
    val audioMime: String?,
    var convert: Boolean,
    var durationMs: Long = 0L,
    /** Where the phone last asked playback to be; laptops report where they actually are. */
    var positionMs: Long = 0L,
    var error: String? = null,
    /** Where the converted stream starts; a laptop's own clock runs from zero. */
    var streamStartMs: Long = 0L,
    var transcode: TranscodeSession? = null,
    var screen: ScreenCastSession? = null,
    /** Laptops receiving this right now. */
    val targets: MutableSet<String> = LinkedHashSet(),
    val reports: MutableMap<String, Report> = LinkedHashMap(),
    /** Kept so a laptop allowed part-way through can start without the conversion restarting. */
    var initSegment: ByteArray? = null,
    var streamMime: String? = null
  ) {
    val mirroring: Boolean get() = media == null
  }

  @Volatile
  var listener: ((Map<String, Any?>) -> Unit)? = null

  @Volatile
  var playbackListener: ((Map<String, Any?>?) -> Unit)? = null

  private val lock = Any()
  private val mainHandler = Handler(Looper.getMainLooper())
  private val random = SecureRandom()

  // Writing to a socket is forbidden on the main thread, and the app's buttons and the notification both call in
  // from there. One thread keeps every message to a laptop in order, whoever asked for it.
  private val sender: ExecutorService = Executors.newSingleThreadExecutor { runnable ->
    Thread(runnable, "cast-send").apply { isDaemon = true }
  }

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

  // region Server

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
    stopSources(synchronized(lock) { active })
    val closing = synchronized(lock) {
      val http = server ?: return
      server = null
      active = null
      ticker?.shutdownNow()
      ticker = null
      http.stop()
      receivers.values.toList().also { receivers.clear() }
    }
    val bye = message("bye", "reason" to "stopped")
    closing.forEach { closeReceiver(it, bye) }
    Log.i(TAG, "Casting stopped")
    CastService.stop(context.applicationContext)
    emit()
    emitPlayback()
  }

  /** Every laptop has to enter the code again; connected ones are disconnected. */
  fun forgetReceivers(context: Context) {
    stopSources(synchronized(lock) { active })
    val closing = synchronized(lock) {
      (pairing ?: CastPairing(context).also { pairing = it }).forgetAll()
      active = null
      receivers.values.toList().also { receivers.clear() }
    }
    closing.forEach { closeReceiver(it, null) }
    emit()
    emitPlayback()
  }

  /**
   * Lets a laptop watch, and optionally control playback for everyone. A laptop allowed while a video is playing
   * joins it; one that is refused stops receiving anything.
   */
  fun setReceiverAccess(context: Context, receiverId: String, allowed: Boolean, canControl: Boolean) {
    val app = context.applicationContext
    val (receiver, item) = synchronized(lock) {
      (pairing ?: CastPairing(app).also { pairing = it }).setAccess(receiverId, allowed, canControl)
      val target = receivers[receiverId] ?: return@synchronized null to null
      target.allowed = allowed
      target.canControl = canControl && allowed
      if (!allowed) active?.targets?.remove(receiverId)
      target to active
    }
    if (receiver == null) {
      emit()
      return
    }
    Log.i(TAG, "${receiver.name}: ${if (allowed) "allowed" else "not allowed"}, control=${receiver.canControl}")
    if (allowed) {
      send(receiver, message("access", "canControl" to receiver.canControl))
      item?.let { joinCast(app, receiver, it) }
    } else {
      send(receiver, message("waiting_approval"))
    }
    emit()
    emitPlayback()
  }

  fun snapshot(): Map<String, Any?> = synchronized(lock) { snapshotLocked() }

  private fun snapshotLocked(): Map<String, Any?> {
    val http = server
    val local = address.takeIf { http != null }
    val watching = active?.targets.orEmpty()
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
          "connectedAt" to it.connectedAt.toDouble(),
          "allowed" to it.allowed,
          "canControl" to it.canControl,
          "watching" to watching.contains(it.id)
        )
      }
    )
  }

  // endregion

  // region Casting a video

  /**
   * Plays a video on every laptop the phone has allowed, replacing whatever they were showing. Blocking (it reads the
   * file); call it off the main thread.
   */
  @Throws(CastException::class)
  fun castMedia(context: Context, receiverId: String, uri: String, title: String, startMs: Long, knownDurationMs: Long) {
    val app = context.applicationContext
    val targets = synchronized(lock) {
      val chosen = receivers[receiverId]
      if (chosen != null && !chosen.allowed) throw CastException("ERR_NOT_ALLOWED", "Allow this laptop first.")
      receivers.values.filter { it.allowed }
    }
    if (targets.isEmpty()) {
      throw CastException("ERR_NO_RECEIVER", "No laptop is allowed to watch yet. Allow one on the Cast screen.")
    }

    val media = try {
      CastMedia.describe(app, uri, title)
    } catch (e: IOException) {
      Log.w(TAG, "Cannot open $uri for casting", e)
      throw CastException("ERR_OPEN", "Couldn't open this video for casting. Check that the file still exists.")
    }
    val tracks = CodecPlanner.readTracks(app, media)
    val plan = planFor(media, tracks, targets)
    Log.i(TAG, "Plan ${media.mimeType} video=${tracks?.video} audio=${tracks?.audio} mode=${plan.mode} ${plan.blocker}")
    if (plan.mode == CodecPlanner.Mode.REFUSE) {
      throw CastException("ERR_UNSUPPORTED", "The laptops can't play ${plan.blocker}, and this phone can't convert it either.")
    }
    val convert = plan.mode == CodecPlanner.Mode.CONVERT
    // The phone measures every file: the app often knows the length already, from playing the video before.
    val measuredMs = if (convert) checkConvertible(app, media) else mediaDurationMs(app, media)
    val durationMs = if (measuredMs > 0) measuredMs else knownDurationMs.coerceAtLeast(0L)

    val next = Active(
      title = media.title,
      uri = media.uri,
      media = media,
      token = newToken(),
      videoMime = tracks?.video,
      audioMime = tracks?.audio,
      convert = convert,
      durationMs = durationMs,
      positionMs = startMs.coerceAtLeast(0L)
    )
    next.targets += targets.map { it.id }

    val previous = replaceActive(next)
    previous?.let { stopSources(it) }
    broadcastToTargets(previous, message("stop"))
    Log.i(
      TAG,
      "Casting ${media.mimeType} (${media.size} bytes, $durationMs ms) " +
        "${if (convert) "converted" else "as it is"} to ${targets.size} laptop(s)"
    )
    if (convert) startTranscode(app, next) else targets.forEach { sendLoad(it, next) }
    emit()
    emitPlayback()
  }

  /** Converts when any laptop cannot play the file as it is: H.264 and AAC is what they all understand. */
  private fun planFor(media: CastMedia, tracks: CodecPlanner.Tracks?, targets: List<Receiver>): CodecPlanner.Plan {
    var result = CodecPlanner.Plan(CodecPlanner.Mode.DIRECT, "")
    for (receiver in targets) {
      val plan = CodecPlanner.plan(media, tracks, receiver.capabilities, receiver.blockedCodecs)
      if (plan.mode == CodecPlanner.Mode.REFUSE) return plan
      if (plan.mode == CodecPlanner.Mode.CONVERT) result = plan
    }
    return result
  }

  /** A laptop allowed part-way through starts watching what the others already are. */
  private fun joinCast(context: Context, receiver: Receiver, item: Active) {
    val (isCurrent, mirroring, convert) = synchronized(lock) {
      if (active !== item) return
      item.targets += receiver.id
      Triple(true, item.mirroring, item.convert)
    }
    if (!isCurrent || mirroring) return
    if (!convert) {
      sendLoad(receiver, item)
      return
    }
    val (segment, mime, startMs, durationMs) = synchronized(lock) {
      arrayOf(item.initSegment, item.streamMime, item.streamStartMs, item.durationMs)
    }
    val header = segment as? ByteArray
    if (header == null || mime !is String) {
      // The conversion has not produced its header yet; this laptop gets it with everyone else.
      return
    }
    sendStreamLoad(receiver, item, mime, startMs as Long, durationMs as Long)
    sendBinary(receiver, header)
  }

  private fun sendStreamLoad(receiver: Receiver, item: Active, mimeType: String, startMs: Long, durationMs: Long) {
    send(
      receiver,
      message(
        "load",
        "kind" to "stream",
        "token" to item.token,
        "mimeType" to mimeType,
        "title" to item.title,
        "startMs" to startMs,
        "durationMs" to durationMs
      )
    )
  }

  private fun sendLoad(receiver: Receiver, item: Active) {
    val media = item.media ?: return
    val (positionMs, durationMs) = synchronized(lock) { item.positionMs to item.durationMs }
    send(
      receiver,
      message(
        "load",
        "kind" to "direct",
        "token" to item.token,
        "url" to "/media/${item.token}",
        "mimeType" to media.mimeType,
        "title" to media.title,
        "startMs" to positionMs,
        "durationMs" to durationMs
      )
    )
  }

  private fun startTranscode(context: Context, item: Active) {
    val media = item.media ?: return
    val session = TranscodeSession(context, media, item.positionMs * 1000L, object : TranscodeSession.Listener {
      override fun onInitSegment(mimeType: String, data: ByteArray) {
        val targets = synchronized(lock) {
          if (active !== item) return
          item.initSegment = data
          item.streamMime = mimeType
          currentTargetsLocked(item)
        }
        Log.i(TAG, "Stream starts at ${item.streamStartMs} ms for ${targets.size} laptop(s)")
        targets.forEach { receiver ->
          sendStreamLoad(receiver, item, mimeType, item.streamStartMs, synchronized(lock) { item.durationMs })
          sendBinary(receiver, data)
        }
      }

      override fun onFragment(data: ByteArray) {
        val targets = currentTargets(item)
        // Every laptop gets its own copy over the same Wi-Fi, so they share the quality between them.
        item.transcode?.setReceiverCount(targets.size)
        targets.forEach { sendBinary(it, data) }
      }

      override fun onEnded() {
        broadcast(item, message("stream_end"))
      }

      override fun onError(errorMessage: String) {
        val changed = synchronized(lock) {
          if (active !== item) return@synchronized false
          item.error = errorMessage
          item.reports.values.forEach { it.status = "error" }
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

  /** Laptops receiving [item] right now: allowed, connected and still targeted. */
  private fun currentTargets(item: Active): List<Receiver> = synchronized(lock) { currentTargetsLocked(item) }

  private fun currentTargetsLocked(item: Active): List<Receiver> {
    if (active !== item) return emptyList()
    return item.targets.mapNotNull { receivers[it] }.filter { it.allowed }
  }

  private fun broadcast(item: Active?, text: String) {
    item ?: return
    currentTargets(item).forEach { send(it, text) }
  }

  private fun broadcastToTargets(item: Active?, text: String) {
    item ?: return
    val targets = synchronized(lock) { item.targets.mapNotNull { receivers[it] } }
    targets.forEach { send(it, text) }
  }

  private fun replaceActive(next: Active?): Active? = synchronized(lock) {
    val previous = active
    active = next
    previous
  }

  // endregion

  // region Controls

  /** play, pause, seek (to [positionMs]) or stop, applied to every laptop watching. */
  fun castControl(action: String, positionMs: Long) {
    val (current, context) = synchronized(lock) {
      val playing = active ?: return
      playing to appContext
    }
    Log.i(TAG, "Control $action pos=$positionMs mirroring=${current.mirroring} laptops=${current.targets.size}")
    when (action) {
      "mute", "unmute" -> current.screen?.setMuted(action == "mute")
      "play", "pause" -> {
        // Pausing a mirror also stops capturing, so the phone is not working for a picture nobody sees.
        current.screen?.setPaused(action == "pause")
        broadcast(current, message(action))
      }
      "seek" -> {
        val target = positionMs.coerceAtLeast(0L)
        when {
          current.convert -> context?.let { restartTranscode(it, current, target) }
          !everyoneCanSeek(current) -> context?.let { convertForSeek(it, current, target) }
          else -> {
            synchronized(lock) { current.positionMs = target }
            broadcast(current, message("seek", "ms" to target))
          }
        }
      }
      "stop" -> {
        val cleared = replaceActive(null)
        stopSources(cleared)
        broadcastToTargets(cleared, message("stop"))
        emitPlayback()
      }
    }
  }

  private fun everyoneCanSeek(item: Active): Boolean = synchronized(lock) {
    item.reports.filterKeys { item.targets.contains(it) }.values.all { it.seekable }
  }

  /** A converted stream has only what the laptops already received, so seeking converts again from the new position. */
  private fun restartTranscode(context: Context, item: Active, positionMs: Long) {
    Log.i(TAG, "Seek to $positionMs ms: converting again")
    val previous = synchronized(lock) {
      item.positionMs = positionMs
      item.initSegment = null
      item.reports.values.forEach { it.status = "loading" }
      item.transcode.also { item.transcode = null }
    }
    previous?.stop()
    broadcast(item, message("stop"))
    startTranscode(context, item)
    emitPlayback()
  }

  /** Switches a file a browser cannot seek in over to a converted stream, starting at [positionMs]. */
  private fun convertForSeek(context: Context, item: Active, positionMs: Long) {
    val media = item.media ?: return
    val durationMs = try {
      checkConvertible(context, media)
    } catch (e: CastException) {
      synchronized(lock) { item.error = e.message }
      emitPlayback()
      return
    }
    Log.i(TAG, "A laptop cannot seek in ${media.mimeType}; converting from $positionMs ms")
    synchronized(lock) {
      item.convert = true
      if (durationMs > 0) item.durationMs = durationMs
      item.positionMs = positionMs
      item.error = null
    }
    broadcast(item, message("stop"))
    startTranscode(context, item)
    emitPlayback()
  }

  /** False when there is nothing to retry: another video, already converting, or the phone cannot convert this one. */
  private fun retryAsConvert(receiver: Receiver, token: String): Boolean {
    val (item, context) = synchronized(lock) {
      val current = active ?: return false
      if (current.token != token || current.convert || !current.targets.contains(receiver.id)) return false
      current to appContext
    }
    if (context == null) return false
    val media = item.media ?: return false
    item.videoMime?.let { receiver.blockedCodecs.add(it) }
    val durationMs = try {
      checkConvertible(context, media)
    } catch (e: CastException) {
      synchronized(lock) { item.error = e.message }
      emitPlayback()
      return true
    }
    Log.i(TAG, "${receiver.name} could not decode ${item.videoMime}; converting instead")
    synchronized(lock) {
      item.convert = true
      if (durationMs > 0) item.durationMs = durationMs
      item.error = null
    }
    broadcast(item, message("stop"))
    startTranscode(context, item)
    emitPlayback()
    return true
  }

  // endregion

  // region Mirroring

  /**
   * Mirrors the phone screen to one laptop, replacing whatever was being cast. [projection] comes from the system's
   * screen-capture prompt and is used once.
   */
  @Throws(CastException::class)
  fun startScreenCast(context: Context, receiverId: String, projection: MediaProjection, withAudio: Boolean) {
    val app = context.applicationContext
    val receiver = synchronized(lock) { receivers[receiverId] }
      ?: throw CastException("ERR_NO_RECEIVER", "That laptop is no longer connected. Open the Cast screen to connect it again.")
    if (!receiver.allowed) throw CastException("ERR_NOT_ALLOWED", "Allow this laptop first.")
    val supportsStream = receiver.capabilities.optJSONObject("stream")?.optBoolean("fmp4-h264-aac") == true
    if (!supportsStream) {
      throw CastException("ERR_UNSUPPORTED", "${receiver.browser.ifEmpty { "This browser" }} can't show the phone screen.")
    }

    val next = Active(
      title = "Phone screen",
      uri = "",
      media = null,
      token = newToken(),
      videoMime = null,
      audioMime = null,
      convert = true
    )
    next.targets += receiver.id

    val previous = replaceActive(next)
    previous?.let { stopSources(it) }
    broadcastToTargets(previous, message("stop"))

    val session = ScreenCastSession(app, projection, withAudio, object : TranscodeSession.Listener {
      override fun onInitSegment(mimeType: String, data: ByteArray) {
        val target = currentTargets(next).firstOrNull() ?: return
        send(target, message("load", "kind" to "screen", "token" to next.token, "mimeType" to mimeType, "title" to next.title))
        sendBinary(target, data)
      }

      override fun onFragment(data: ByteArray) {
        currentTargets(next).forEach { sendBinary(it, data) }
      }

      // Android stops the capture when the phone locks, and the Stop button in its own notice does the same.
      override fun onEnded() {
        val cleared = synchronized(lock) { if (active === next) replaceActive(null) else null }
        if (cleared != null) {
          broadcastToTargets(cleared, message("stop"))
          emitPlayback()
        }
      }

      override fun onError(errorMessage: String) {
        val changed = synchronized(lock) {
          if (active !== next) return@synchronized false
          next.error = errorMessage
          true
        }
        if (changed) emitPlayback()
      }
    })
    synchronized(lock) { next.screen = session }
    try {
      session.start()
    } catch (e: IllegalStateException) {
      Log.w(TAG, "Screen capture failed to start", e)
      synchronized(lock) { if (active === next) active = null }
      session.stop()
      emitPlayback()
      throw CastException("ERR_SCREEN", "The phone couldn't start screen sharing.")
    }
    Log.i(TAG, "Mirroring the screen to ${receiver.name}")
    emitPlayback()
  }

  /** Shows on the phone's remote why screen sharing could not start. */
  fun reportScreenCastFailure(receiverId: String, message: String) {
    val receiver = synchronized(lock) { receivers[receiverId] } ?: return
    val failed = Active(
      title = "Phone screen",
      uri = "",
      media = null,
      token = newToken(),
      videoMime = null,
      audioMime = null,
      convert = true,
      error = message
    )
    failed.targets += receiver.id
    synchronized(lock) {
      if (active != null && active?.mirroring != true) return
      active = failed
    }
    emitPlayback()
  }

  // endregion

  // region Playback state

  fun playbackSnapshot(): Map<String, Any?>? = synchronized(lock) {
    val current = active ?: return@synchronized null
    val watching = current.targets.mapNotNull { receivers[it] }.filter { it.allowed }
    // The furthest ahead is the one worth showing and saving: resuming should not repeat what was already watched.
    val leader = current.targets
      .mapNotNull { id -> current.reports[id]?.takeIf { current.targets.contains(id) } }
      .maxByOrNull { it.positionMs }
    val connected = watching.isNotEmpty()
    mapOf(
      "receiverId" to (watching.firstOrNull()?.id ?: ""),
      "receiverName" to receiverSummary(watching),
      "kind" to if (current.mirroring) "screen" else "video",
      "uri" to current.uri,
      "title" to current.title,
      "status" to when {
        !connected -> "disconnected"
        current.error != null -> "error"
        else -> leader?.status ?: "loading"
      },
      "muted" to (current.screen?.muted ?: false),
      "positionMs" to positionOf(current, leader).toDouble(),
      "durationMs" to current.durationMs.toDouble(),
      "error" to current.error
    )
  }

  private fun positionOf(item: Active, leader: Report?): Long {
    val reported = leader?.positionMs ?: return item.positionMs
    return if (item.convert && !item.mirroring) item.streamStartMs + reported else reported
  }

  private fun receiverSummary(watching: List<Receiver>): String = when (watching.size) {
    0 -> "no laptop"
    1 -> watching.first().name
    else -> "${watching.size} laptops"
  }

  internal fun mediaFor(token: String): CastMedia? = synchronized(lock) { active?.takeIf { it.token == token }?.media }

  /** Stops a converter or screen capture belonging to [item] and forgets it. */
  private fun stopSources(item: Active?) {
    val (transcode, screen) = synchronized(lock) {
      val sources = item?.transcode to item?.screen
      item?.transcode = null
      item?.screen = null
      sources
    }
    transcode?.stop()
    screen?.stop()
  }

  private fun stopPendingTranscodes() {
    while (true) {
      val session = synchronized(lock) { stopping.removeFirstOrNull() } ?: return
      session.stop()
    }
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
          // A laptop's own controls; only one the phone trusts may move what everyone is watching.
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

  private fun onHello(socket: CastWebSocket, hello: JSONObject): Receiver? {
    val current = synchronized(lock) { pairing } ?: return null
    val token: String? = hello.optString("token", null)
    if (token != null && current.isPaired(token)) {
      val access = current.access(token)
      return accept(socket, hello, current.receiverId(token), access)
    }
    socket.sendText(message("need_code"))
    return null
  }

  private fun onPair(socket: CastWebSocket, request: CastHttpServer.Request, hello: JSONObject, code: String): Receiver? {
    val current = synchronized(lock) { pairing } ?: return null
    return when (val result = current.pair(code, request.remoteAddress, receiverName(hello))) {
      is CastPairing.Result.Paired -> {
        socket.sendText(message("paired", "token" to result.token))
        accept(socket, hello, current.receiverId(result.token), current.access(result.token))
      }
      is CastPairing.Result.Refused -> {
        socket.sendText(message("pair_failed", "retryAfterMs" to result.retryAfterMs))
        // Too many wrong codes renews the code; the app has to show the new one.
        emit()
        null
      }
    }
  }

  private fun accept(socket: CastWebSocket, hello: JSONObject, id: String, access: CastPairing.Access): Receiver? {
    val receiver = Receiver(
      id = id,
      name = receiverName(hello),
      browser = clean(hello.optString("browser")),
      os = clean(hello.optString("os")),
      capabilities = hello.optJSONObject("capabilities") ?: JSONObject(),
      connectedAt = System.currentTimeMillis(),
      socket = socket
    )
    receiver.allowed = access.allowed
    receiver.canControl = access.canControl && access.allowed
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
      resume = active?.takeIf { it.targets.contains(id) }
      appContext
    }
    // The same laptop reconnected before its old connection timed out.
    replaced?.socket?.close()
    Log.i(TAG, "Laptop connected: ${receiver.name}${if (receiver.allowed) "" else " (waiting for approval)"}")

    if (!receiver.allowed) {
      send(receiver, message("waiting_approval"))
      emit()
      return receiver
    }
    send(
      receiver,
      message("welcome", "receiverId" to id, "phoneName" to phoneName(context), "canControl" to receiver.canControl)
    )
    // Reconnected part-way through: pick the video back up.
    val item = resume ?: synchronized(lock) { active }?.takeIf { !it.mirroring }
    if (item != null && context != null) joinCast(context, receiver, item)
    emit()
    if (item != null) emitPlayback()
    return receiver
  }

  private fun remove(receiver: Receiver) {
    val (removed, wasWatching) = synchronized(lock) {
      val gone = receivers.remove(receiver.id, receiver)
      val watching = active?.targets?.contains(receiver.id) == true
      gone to watching
    }
    if (!removed) return
    // Nothing left to send to: converting or capturing on would only heat the phone.
    if (wasWatching && currentTargets(synchronized(lock) { active } ?: return).isEmpty()) {
      stopSources(synchronized(lock) { active })
    }
    Log.i(TAG, "Laptop disconnected: ${receiver.name}")
    emit()
    if (wasWatching) emitPlayback()
  }

  private fun onReceiverControl(receiver: Receiver, control: JSONObject) {
    val action = control.optString("action")
    val allowed = synchronized(lock) {
      val current = active ?: return
      current.token == control.optString("token") && current.targets.contains(receiver.id)
    }
    if (!allowed) return
    if (!receiver.canControl) {
      Log.i(TAG, "${receiver.name} tried to $action but may only watch")
      send(receiver, message("access", "canControl" to false))
      return
    }
    castControl(action, control.optLong("ms", 0L))
  }

  private fun onReceiverState(receiver: Receiver, report: JSONObject) {
    val status = report.optString("status")
    if (status !in PLAYBACK_STATUSES) return
    // canPlayType was too optimistic: this laptop cannot really decode the file, so convert it for everyone.
    if (status == "error" && report.optInt("errorCode") in DECODE_ERROR_CODES) {
      if (retryAsConvert(receiver, report.optString("token"))) return
    }
    var transcode: TranscodeSession? = null
    var slowestAheadMs = 0L
    synchronized(lock) {
      val current = active ?: return
      if (!current.targets.contains(receiver.id) || report.optString("token") != current.token) return
      val entry = current.reports.getOrPut(receiver.id) { Report() }
      entry.status = status
      entry.positionMs = report.optLong("positionMs", entry.positionMs).coerceAtLeast(0L)
      entry.bufferedAheadMs = report.optLong("bufferedAheadMs", 0L).coerceAtLeast(0L)
      entry.error = report.optString("error").takeIf { status == "error" && it.isNotEmpty() }?.take(200)
      if (!current.convert) {
        entry.seekable = report.optBoolean("seekable", true)
        val reportedDuration = report.optLong("durationMs", 0L)
        if (reportedDuration > 0 && current.durationMs <= 0) current.durationMs = reportedDuration
      }
      current.error = current.reports.values.firstNotNullOfOrNull { it.error }
      // The slowest laptop sets the pace, so nobody is left behind.
      slowestAheadMs = current.targets.mapNotNull { current.reports[it]?.bufferedAheadMs }.minOrNull() ?: 0L
      transcode = current.transcode
    }
    transcode?.setBufferedAhead(slowestAheadMs)
    emitPlayback()
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

  // region Sending

  private fun send(receiver: Receiver?, text: String) {
    val target = receiver ?: return
    runCatching { sender.execute { target.socket.sendText(text) } }
  }

  private fun sendBinary(receiver: Receiver?, data: ByteArray) {
    val target = receiver ?: return
    runCatching { sender.execute { target.socket.sendBinary(data) } }
  }

  /** Says goodbye and closes, in that order and off the caller's thread. */
  private fun closeReceiver(receiver: Receiver, farewell: String?) {
    runCatching {
      sender.execute {
        if (farewell != null) receiver.socket.sendText(farewell)
        receiver.socket.close()
      }
    }
  }

  // endregion

  // region File details

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
        throw CastException("ERR_TOO_LARGE", "This video is too large for this phone to convert.")
      }
      val durationUs = if (format.containsKey(MediaFormat.KEY_DURATION)) format.getLong(MediaFormat.KEY_DURATION) else 0L
      return if (durationUs > 0) durationUs / 1000L else mediaDurationMs(context, media)
    } catch (e: IOException) {
      throw CastException("ERR_OPEN", "Couldn't read this video for casting.")
    } finally {
      runCatching { extractor.release() }
    }
  }

  /** The file's length, read from its metadata; 0 when even that does not say. */
  private fun mediaDurationMs(context: Context, media: CastMedia): Long {
    val retriever = MediaMetadataRetriever()
    return try {
      val uri = Uri.parse(media.uri)
      if (uri.scheme.equals("content", ignoreCase = true)) {
        val descriptor = VlcEngine.openContentDescriptor(context, uri) ?: return 0L
        descriptor.use { retriever.setDataSource(it.fileDescriptor) }
      } else {
        retriever.setDataSource(uri.path ?: media.uri)
      }
      val reported = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: 0L
      if (reported > 0) reported else matroskaDurationMs(context, media)
    } catch (e: RuntimeException) {
      Log.w(TAG, "Could not read the length of ${media.uri}", e)
      matroskaDurationMs(context, media)
    } finally {
      runCatching { retriever.release() }
    }
  }

  /** MKV and WebM carry their length in the header, which Android's metadata reader often fails to report. */
  private fun matroskaDurationMs(context: Context, media: CastMedia): Long {
    if (media.mimeType != "video/x-matroska" && media.mimeType != "video/webm" && media.mimeType != "video/mkv") return 0L
    return try {
      media.open(context, 0L).use { MatroskaTracks.readDurationMs(it.channel) }
    } catch (e: IOException) {
      Log.w(TAG, "Could not read the header length of ${media.uri}", e)
      0L
    }
  }

  // endregion

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

  /** The laptop's own name first, so two identical browsers are still told apart. */
  private fun receiverName(hello: JSONObject): String =
    listOf(clean(hello.optString("deviceName")), clean(hello.optString("browser")), clean(hello.optString("os")))
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
