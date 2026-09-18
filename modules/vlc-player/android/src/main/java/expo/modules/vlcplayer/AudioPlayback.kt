package expo.modules.vlcplayer

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.MediaMetadata
import android.media.session.MediaSession
import android.media.session.PlaybackState
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.os.ParcelFileDescriptor
import android.util.Log
import org.json.JSONArray
import org.videolan.libvlc.LibVLC
import org.videolan.libvlc.MediaPlayer
import java.io.IOException
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

internal data class AudioItem(
  val uri: String,
  val title: String,
  val artist: String,
  val album: String,
  val artKey: String,
  val durationMs: Long
)

/**
 * Music playback that outlives the player screen. Owns its own libVLC player, the media session the lock screen
 * and Bluetooth talk to, and the queue.
 *
 * Threading: every libVLC call runs on the `vlc-audio` worker, because MediaPlayer.stop() joins native threads and
 * froze the app when it was called on main. Everything else — state, queue, session, listeners — is main thread only.
 */
object AudioPlayback {
  const val REPEAT_OFF = "off"
  const val REPEAT_ALL = "all"
  const val REPEAT_ONE = "one"

  private const val TAG = "AudioPlayback"
  private const val SESSION_TAG = "LuckyPlayerAudio"
  private const val ART_WIDTH = 512
  private const val EMIT_INTERVAL_MS = 500L
  /** Pressing previous this far into a track restarts it instead of stepping back. */
  private const val RESTART_THRESHOLD_MS = 3_000L

  /** Sends state to JS. */
  var listener: ((Map<String, Any?>) -> Unit)? = null

  /** Set by the service so the notification can follow state without a round trip through JS. */
  internal var notificationListener: (() -> Unit)? = null

  private val mainHandler = Handler(Looper.getMainLooper())
  private val worker: ExecutorService = Executors.newSingleThreadExecutor { runnable ->
    Thread(runnable, "vlc-audio").apply { isDaemon = true }
  }

  private var appContext: Context? = null
  private var libVLC: LibVLC? = null
  private var player: MediaPlayer? = null
  private var descriptor: ParcelFileDescriptor? = null
  private var session: MediaSession? = null
  private var audioFocus: PlaybackAudioFocus? = null

  private var queue: List<AudioItem> = emptyList()
  /** Indices into [queue], in play order. Equal to the queue order unless shuffle is on. */
  private var order: List<Int> = emptyList()
  private var orderPosition = -1
  private var generation = 0

  private var playing = false
  private var loading = false
  private var positionMs = 0L
  private var durationMs = 0L
  private var repeat = REPEAT_OFF
  private var shuffle = false
  private var rate = 1f
  /** True while another app holds focus, so playback resumes by itself when focus comes back. */
  private var pausedByFocusLoss = false
  private var lastEmitAt = 0L
  private var artBitmap: Bitmap? = null
  private var artBitmapKey: String? = null

  val isActive: Boolean
    get() = queue.isNotEmpty()

  internal val current: AudioItem?
    get() = order.getOrNull(orderPosition)?.let { queue.getOrNull(it) }

  internal val isPlaying: Boolean
    get() = playing

  internal val sessionToken: MediaSession.Token?
    get() = session?.sessionToken

  // region JS API — main thread only

  /** Replaces the queue and starts at [startIndex]. `queueJson` is an array of track objects. */
  fun setQueue(context: Context, queueJson: String, startIndex: Int, positionMs: Long) {
    appContext = context.applicationContext
    queue = parseQueue(queueJson)
    if (queue.isEmpty()) {
      stop()
      return
    }
    rebuildOrder(startIndex.coerceIn(0, queue.size - 1))
    openCurrent(positionMs, autoPlay = true)
  }

  fun play() {
    val target = current ?: return
    if (playing) return
    if (!requestFocus()) {
      publish()
      return
    }
    if (loadedUri != target.uri) {
      openCurrent(positionMs, autoPlay = true)
      return
    }
    playing = true
    pausedByFocusLoss = false
    onWorker { player?.play() }
    publish()
  }

  fun pause() {
    if (!playing) return
    playing = false
    pausedByFocusLoss = false
    onWorker { player?.pause() }
    publish()
  }

  fun toggle() {
    if (playing) pause() else play()
  }

  fun next(fromUser: Boolean = true) {
    if (queue.isEmpty()) return
    val last = orderPosition >= order.size - 1
    if (last && repeat == REPEAT_OFF && !fromUser) {
      // The queue ran out on its own: stop at the end instead of wrapping around.
      playing = false
      positionMs = 0
      onWorker { player?.stop() }
      publish()
      return
    }
    orderPosition = if (last) 0 else orderPosition + 1
    openCurrent(0, autoPlay = true)
  }

  fun previous() {
    if (queue.isEmpty()) return
    if (positionMs > RESTART_THRESHOLD_MS) {
      seek(0)
      return
    }
    orderPosition = if (orderPosition <= 0) order.size - 1 else orderPosition - 1
    openCurrent(0, autoPlay = true)
  }

  fun playIndex(index: Int) {
    val position = order.indexOf(index)
    if (position < 0) return
    orderPosition = position
    openCurrent(0, autoPlay = true)
  }

  fun seek(toMs: Long) {
    val clamped = if (durationMs > 0) toMs.coerceIn(0, durationMs) else toMs.coerceAtLeast(0)
    positionMs = clamped
    onWorker { player?.time = clamped }
    publish(force = true)
  }

  fun setRepeat(mode: String) {
    repeat = when (mode) {
      REPEAT_ALL, REPEAT_ONE -> mode
      else -> REPEAT_OFF
    }
    publish(force = true)
  }

  fun setShuffle(enabled: Boolean) {
    if (shuffle == enabled) return
    shuffle = enabled
    val playingIndex = order.getOrNull(orderPosition) ?: 0
    rebuildOrder(playingIndex)
    publish(force = true)
  }

  fun setRate(value: Float) {
    rate = value.coerceIn(0.25f, 4f)
    onWorker { player?.rate = rate }
    publish(force = true)
  }

  fun stop() {
    generation++
    playing = false
    loading = false
    pausedByFocusLoss = false
    queue = emptyList()
    order = emptyList()
    orderPosition = -1
    positionMs = 0
    durationMs = 0
    loadedUri = null
    releaseArt()
    audioFocus?.abandon()
    session?.let {
      it.isActive = false
      it.release()
    }
    session = null
    val toRelease = player
    val instance = libVLC
    val openDescriptor = descriptor
    player = null
    libVLC = null
    descriptor = null
    onWorker {
      toRelease?.setEventListener(null)
      toRelease?.stop()
      toRelease?.release()
      closeDescriptor(openDescriptor)
      instance?.let { VlcEngine.release(it) }
    }
    publish(force = true)
    appContext?.let { AudioPlaybackService.stop(it) }
  }

  fun state(): Map<String, Any?> = snapshot()

  // endregion

  private var loadedUri: String? = null

  private fun openCurrent(startAtMs: Long, autoPlay: Boolean) {
    val context = appContext ?: return
    val item = current ?: return
    ensurePlayer(context)
    if (autoPlay && !requestFocus()) {
      playing = false
      publish(force = true)
      return
    }
    loadedUri = item.uri
    positionMs = startAtMs
    durationMs = item.durationMs
    playing = autoPlay
    loading = true
    pausedByFocusLoss = false
    loadArt(context, item)
    updateSessionMetadata(item)
    publish(force = true)
    AudioPlaybackService.start(context)

    val gen = ++generation
    val activePlayer = player ?: return
    val instance = libVLC ?: return
    onWorker {
      activePlayer.stop()
      closeDescriptor(descriptor)
      descriptor = null
      val opened = try {
        VlcEngine.openMedia(context, instance, item.uri)
      } catch (e: IOException) {
        postIfCurrent(gen) { fail("open_failed", e.message ?: "Cannot open this track") }
        return@onWorker
      } catch (e: SecurityException) {
        postIfCurrent(gen) { fail("permission_denied", e.message ?: "No permission to read this track") }
        return@onWorker
      }
      descriptor = opened.descriptor
      if (startAtMs > 0) opened.media.addOption(":start-time=${startAtMs / 1000.0}")
      activePlayer.setMedia(opened.media)
      opened.media.release()
      activePlayer.rate = rate
      activePlayer.play()
      if (!autoPlay) activePlayer.pause()
      postIfCurrent(gen) { loading = false }
    }
  }

  private fun ensurePlayer(context: Context) {
    if (player != null) return
    val instance = VlcEngine.acquire(context)
    libVLC = instance
    // Created on main so libVLC delivers its events on main, like the video player does.
    val created = MediaPlayer(instance)
    created.setEventListener { event -> onPlayerEvent(event) }
    player = created
    audioFocus = PlaybackAudioFocus(context) { change -> onFocusChange(change) }
    session = MediaSession(context, SESSION_TAG).apply {
      setCallback(sessionCallback, mainHandler)
      isActive = true
    }
  }

  private fun onPlayerEvent(event: MediaPlayer.Event) {
    when (event.type) {
      MediaPlayer.Event.TimeChanged -> {
        positionMs = event.timeChanged
        publish()
        updateSessionState()
      }
      MediaPlayer.Event.LengthChanged -> {
        if (event.lengthChanged > 0) durationMs = event.lengthChanged
        publish(force = true)
      }
      MediaPlayer.Event.Playing -> {
        playing = true
        loading = false
        publish(force = true)
      }
      MediaPlayer.Event.Paused -> {
        playing = false
        publish(force = true)
      }
      MediaPlayer.Event.EndReached -> onEndReached()
      MediaPlayer.Event.EncounteredError -> fail("playback_failed", "This track could not be played")
    }
  }

  private fun onEndReached() {
    if (repeat == REPEAT_ONE) {
      openCurrent(0, autoPlay = true)
      return
    }
    next(fromUser = false)
  }

  private fun onFocusChange(change: PlaybackAudioFocus.Change) {
    when (change) {
      PlaybackAudioFocus.Change.GAIN -> if (pausedByFocusLoss) {
        pausedByFocusLoss = false
        play()
      }
      PlaybackAudioFocus.Change.LOSS_TRANSIENT -> if (playing) {
        pause()
        // pause() clears the flag; set it after so playback comes back when the call ends.
        pausedByFocusLoss = true
      }
      PlaybackAudioFocus.Change.LOSS -> {
        if (playing) pause()
        pausedByFocusLoss = false
      }
    }
  }

  /** Headphones unplugged or Bluetooth disconnected: pause, and never resume by itself. */
  internal fun onBecomingNoisy() {
    if (playing) pause()
  }

  private fun requestFocus(): Boolean {
    val granted = audioFocus?.request() ?: false
    if (!granted) {
      playing = false
      Log.i(TAG, "Audio focus refused; not starting playback")
    }
    return granted
  }

  private fun fail(code: String, message: String) {
    playing = false
    loading = false
    listener?.invoke(snapshot() + mapOf("errorCode" to code, "errorMessage" to message))
    notificationListener?.invoke()
  }

  private fun rebuildOrder(startIndex: Int) {
    val indices = queue.indices.toMutableList()
    if (shuffle) {
      indices.shuffle()
      // The track the user started stays first; the rest are shuffled behind it.
      indices.remove(startIndex)
      indices.add(0, startIndex)
    }
    order = indices
    orderPosition = order.indexOf(startIndex).coerceAtLeast(0)
  }

  private fun parseQueue(json: String): List<AudioItem> = try {
    val array = JSONArray(json)
    (0 until array.length()).mapNotNull { index ->
      val item = array.optJSONObject(index) ?: return@mapNotNull null
      val uri = item.optString("uri")
      if (uri.isEmpty()) return@mapNotNull null
      AudioItem(
        uri = uri,
        title = item.optString("title", uri),
        artist = item.optString("artist", ""),
        album = item.optString("album", ""),
        artKey = item.optString("artKey", ""),
        durationMs = item.optLong("duration", 0)
      )
    }
  } catch (e: Exception) {
    Log.w(TAG, "Could not read the queue", e)
    emptyList()
  }

  // region session and artwork

  private val sessionCallback = object : MediaSession.Callback() {
    override fun onPlay() = play()
    override fun onPause() = pause()
    override fun onStop() = stop()
    override fun onSkipToNext() = next()
    override fun onSkipToPrevious() = previous()
    override fun onSeekTo(pos: Long) = seek(pos)
  }

  private fun updateSessionMetadata(item: AudioItem) {
    val builder = MediaMetadata.Builder()
      .putString(MediaMetadata.METADATA_KEY_TITLE, item.title)
      .putString(MediaMetadata.METADATA_KEY_ARTIST, item.artist.ifEmpty { "Unknown artist" })
      .putString(MediaMetadata.METADATA_KEY_ALBUM, item.album)
      .putLong(MediaMetadata.METADATA_KEY_DURATION, if (item.durationMs > 0) item.durationMs else -1L)
    artBitmap?.let { builder.putBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART, it) }
    session?.setMetadata(builder.build())
    updateSessionState()
  }

  private fun updateSessionState() {
    val state = when {
      loading -> PlaybackState.STATE_BUFFERING
      playing -> PlaybackState.STATE_PLAYING
      else -> PlaybackState.STATE_PAUSED
    }
    session?.setPlaybackState(
      PlaybackState.Builder()
        .setActions(SESSION_ACTIONS)
        .setState(state, positionMs, if (playing) rate else 0f)
        .build()
    )
  }

  /** Album art for the lock screen and the notification. Decoded off the main thread. */
  private fun loadArt(context: Context, item: AudioItem) {
    if (artBitmapKey == item.artKey) return
    releaseArt()
    artBitmapKey = item.artKey
    val gen = generation
    worker.execute {
      val path = ThumbnailCache.get(context, item.uri, item.artKey.ifEmpty { item.uri.hashCode().toString() }, ART_WIDTH, artwork = true)
      val bitmap = path?.let { BitmapFactory.decodeFile(Uri.parse(it).path) }
      mainHandler.post {
        if (gen != generation || artBitmapKey != item.artKey) {
          bitmap?.recycle()
          return@post
        }
        artBitmap = bitmap
        current?.let { updateSessionMetadata(it) }
        notificationListener?.invoke()
      }
    }
  }

  internal fun artwork(): Bitmap? = artBitmap

  private fun releaseArt() {
    artBitmap = null
    artBitmapKey = null
  }

  // endregion

  private fun snapshot(): Map<String, Any?> {
    val item = current
    return mapOf(
      "active" to isActive,
      "playing" to playing,
      "loading" to loading,
      "uri" to item?.uri,
      "title" to item?.title,
      "artist" to item?.artist,
      "album" to item?.album,
      "artKey" to item?.artKey,
      "positionMs" to positionMs,
      "durationMs" to durationMs,
      "index" to order.getOrNull(orderPosition),
      "queueSize" to queue.size,
      "repeat" to repeat,
      "shuffle" to shuffle,
      "rate" to rate.toDouble()
    )
  }

  /** Sends state to JS, at most every [EMIT_INTERVAL_MS] unless [force]d, and refreshes the notification. */
  private fun publish(force: Boolean = false) {
    val now = System.currentTimeMillis()
    if (!force && now - lastEmitAt < EMIT_INTERVAL_MS) return
    lastEmitAt = now
    listener?.invoke(snapshot())
    if (force) {
      updateSessionState()
      notificationListener?.invoke()
    }
  }

  private fun onWorker(block: () -> Unit) {
    worker.execute {
      try {
        block()
      } catch (e: Exception) {
        Log.w(TAG, "Audio playback call failed", e)
      }
    }
  }

  private fun postIfCurrent(gen: Int, block: () -> Unit) {
    mainHandler.post { if (gen == generation) block() }
  }

  private fun closeDescriptor(open: ParcelFileDescriptor?) {
    try {
      open?.close()
    } catch (_: IOException) {
    }
  }

  private val SESSION_ACTIONS = PlaybackState.ACTION_PLAY or
    PlaybackState.ACTION_PAUSE or
    PlaybackState.ACTION_PLAY_PAUSE or
    PlaybackState.ACTION_STOP or
    PlaybackState.ACTION_SEEK_TO or
    PlaybackState.ACTION_SKIP_TO_NEXT or
    PlaybackState.ACTION_SKIP_TO_PREVIOUS
}

/** Kept out of the object body so the service can send an explicit intent without importing it. */
internal fun Context.audioServiceIntent(action: String): Intent =
  Intent(this, AudioPlaybackService::class.java).setAction(action)
