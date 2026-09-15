package expo.modules.vlcplayer

import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.os.Build
import android.os.ParcelFileDescriptor
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import org.videolan.libvlc.MediaPlayer
import org.videolan.libvlc.interfaces.IMedia
import org.videolan.libvlc.util.VLCVideoLayout
import java.io.IOException
import java.util.concurrent.Callable
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.RejectedExecutionException
import java.util.concurrent.TimeUnit
import kotlin.math.abs

/**
 * Threading contract:
 * - libVLC calls (stop, setMedia, play, getters, setters, release) run on [worker] only. stop() joins the
 *   input thread, which can be waiting on the main thread for the video surface; calling it on main
 *   deadlocks (ANR seen on Infinix X6880 / MT6789).
 * - View work (attachViews, detachViews, setVideoScale, layout) and all JS events run on main.
 * - Plain fields are main-thread state; values crossing threads are captured before posting.
 */
class VlcPlayerView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  override val shouldUseAndroidLayout = true

  private val onLoad by EventDispatcher<Map<String, Any>>()
  private val onProgress by EventDispatcher<Map<String, Any>>()
  private val onBuffering by EventDispatcher<Map<String, Any>>()
  private val onPlaybackStateChange by EventDispatcher<Map<String, Any>>()
  private val onEnd by EventDispatcher<Map<String, Any>>()
  private val onError by EventDispatcher<Map<String, Any>>()
  private val onDecoderFallback by EventDispatcher<Map<String, Any>>()
  private val onTracksChanged by EventDispatcher<Map<String, Any>>()
  private val onPictureInPictureChange by EventDispatcher<Map<String, Any>>()
  private val onPictureInPictureAction by EventDispatcher<Map<String, Any>>()

  private val libVLC = VlcEngine.acquire(context)
  private val player = MediaPlayer(libVLC) // created on main so its events are delivered on main
  private val videoLayout = VLCVideoLayout(context)
  private val mainHandler = Handler(Looper.getMainLooper())
  private val worker: ExecutorService = Executors.newSingleThreadExecutor { runnable ->
    Thread(runnable, "vlc-player").apply { isDaemon = true }
  }

  var source: String? = null
  var startPositionMs: Long = 0
  /** Subtitle file the user picked for this video; added on every load. */
  var externalSubtitle: String? = null
  var matchFrameRate = true

  private var loadedSource: String? = null
  private var paused = false
  private var rate = 1f
  private var volume = 100
  private var aspect = "fit"
  private var hwMode = "auto"
  private var audioDelayMs = 0L
  private var subtitleDelayMs = 0L
  private var audioTrackId: Int? = null
  private var subtitleTrackId: Int? = null

  private var generation = 0
  private var transitioning = false
  private var usingHw = true
  private var fellBack = false
  private var loadEmitted = false
  private var hasVideoTrack = false
  private var hasVideoOutput = false
  private var viewsAttached = false
  private var pendingLoad = false
  private var released = false
  private var firstTimeMs = -1L
  private var lastTimeMs = 0L
  private var lastProgressMs = -1L
  private var durationMs = 0L
  private var videoCodec = ""
  private var frameRateApplied = false
  private var inPictureInPicture = false
  private var pictureInPictureActivity: Activity? = null

  // The resize into or out of picture-in-picture can land just before the activity reports the new mode.
  private val recheckPictureInPicture = Runnable { refreshPictureInPicture() }

  // Buttons in the picture-in-picture window arrive as broadcasts from the system UI.
  private val pictureInPictureControls = object : BroadcastReceiver() {
    override fun onReceive(context: Context?, intent: Intent?) {
      val control = intent?.getStringExtra(PictureInPicture.EXTRA_CONTROL) ?: return
      if (inPictureInPicture) onPictureInPictureAction(mapOf("action" to control))
    }
  }

  // Touched on worker only.
  private var descriptor: ParcelFileDescriptor? = null

  private data class PlaybackSettings(
    val paused: Boolean,
    val rate: Float,
    val volume: Int,
    val audioDelayMs: Long,
    val subtitleDelayMs: Long,
    val audioTrackId: Int?,
    val subtitleTrackId: Int?
  )

  private data class SubtitleRequest(val source: String, val external: String?, val selectDefault: Boolean)

  init {
    videoLayout.layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
    addView(videoLayout)
    player.setEventListener { event -> onPlayerEvent(event) }
  }

  // React Native sizes this view but never measures native children; without this the surface stays 0x0.
  override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
    val width = r - l
    val height = b - t
    videoLayout.measure(
      MeasureSpec.makeMeasureSpec(width, MeasureSpec.EXACTLY),
      MeasureSpec.makeMeasureSpec(height, MeasureSpec.EXACTLY)
    )
    videoLayout.layout(0, 0, width, height)
    if (changed) refreshPictureInPicture()
  }

  override fun onWindowFocusChanged(hasWindowFocus: Boolean) {
    super.onWindowFocusChanged(hasWindowFocus)
    refreshPictureInPicture()
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    if (released) return
    hookPictureInPicture()
    if (!viewsAttached) {
      player.attachViews(videoLayout, null, true, false)
      viewsAttached = true
    }
    if (pendingLoad) {
      pendingLoad = false
      load(startPositionMs)
    }
  }

  // region Props (main thread)

  fun commit() {
    if (released || source == loadedSource) return
    if (source == null) {
      generation++
      loadedSource = null
      loadEmitted = false
      onWorker {
        player.stop()
        closeDescriptor()
      }
      return
    }
    fellBack = false
    loadEmitted = false
    if (viewsAttached) load(startPositionMs) else pendingLoad = true
  }

  fun setPaused(value: Boolean?) {
    paused = value ?: false
    if (!loadEmitted) return
    val shouldPause = paused
    onWorker {
      if (shouldPause) {
        if (player.isPlaying) player.pause()
      } else if (!player.isPlaying) {
        player.play()
      }
    }
  }

  fun setRate(value: Float?) {
    rate = (value ?: 1f).coerceIn(0.25f, 4f)
    val next = rate
    if (loadEmitted) onWorker { player.setRate(next) }
  }

  fun setVolume(value: Int?) {
    volume = (value ?: 100).coerceIn(0, 200)
    val next = volume
    if (loadEmitted) onWorker { player.setVolume(next) }
  }

  fun setAspect(value: String?) {
    aspect = value ?: "fit"
    if (loadEmitted && !transitioning) player.setVideoScale(scaleFor(aspect))
  }

  // Scales the video layout around its center. SurfaceView follows view transforms on Android 7+.
  fun setZoom(value: Float?) {
    val zoom = (value ?: 1f).coerceIn(1f, MAX_ZOOM)
    videoLayout.scaleX = zoom
    videoLayout.scaleY = zoom
  }

  fun setHwMode(value: String?) {
    val mode = value ?: "auto"
    if (mode == hwMode) return
    hwMode = mode
    if (loadEmitted) {
      fellBack = false
      reloadAt(lastTimeMs)
    }
  }

  fun setAudioTrack(id: Int?) {
    audioTrackId = id
    if (loadEmitted && id != null) onWorker { player.setAudioTrack(id) }
  }

  fun setSubtitleTrack(id: Int?) {
    subtitleTrackId = id
    if (loadEmitted && id != null) onWorker { player.setSpuTrack(id) }
  }

  fun setAudioDelay(ms: Long?) {
    audioDelayMs = ms ?: 0L
    val micros = audioDelayMs * 1000
    if (loadEmitted) onWorker { player.setAudioDelay(micros) }
  }

  fun setSubtitleDelay(ms: Long?) {
    subtitleDelayMs = ms ?: 0L
    val micros = subtitleDelayMs * 1000
    if (loadEmitted) onWorker { player.setSpuDelay(micros) }
  }

  // endregion

  // region Imperative API (called from the Expo module queue, never main)

  fun seek(positionMs: Long) {
    val target = positionMs.coerceAtLeast(0L)
    onWorker { if (player.hasMedia()) player.setTime(target) }
  }

  fun addSubtitle(uri: String): Boolean {
    val parsed = Uri.parse(uri)
    val target = if (parsed.scheme == "content") VlcEngine.copySubtitleToCache(context, parsed) ?: return false else parsed
    return try {
      worker.submit(Callable { player.addSlave(IMedia.Slave.Type.Subtitle, target, true) })
        .get(WORKER_CALL_TIMEOUT_S, TimeUnit.SECONDS)
    } catch (e: Exception) {
      false
    }
  }

  // endregion

  fun release() {
    if (released) return
    released = true
    generation++
    unhookPictureInPicture()
    mainHandler.removeCallbacksAndMessages(null)
    player.setEventListener(null)
    if (viewsAttached) player.detachViews()
    videoLayout.keepScreenOn = false
    if (frameRateApplied) appContext.currentActivity?.let { FrameRateMatcher.reset(it) }
    onWorker(allowAfterRelease = true) {
      player.stop()
      player.release()
      closeDescriptor()
      VlcEngine.release(libVLC)
    }
    worker.shutdown()
  }

  private fun load(startAtMs: Long) {
    val src = source ?: return
    loadedSource = src
    usingHw = hwMode != "sw" && !fellBack
    hasVideoTrack = false
    hasVideoOutput = false
    firstTimeMs = -1L
    lastTimeMs = startAtMs
    lastProgressMs = -1L
    transitioning = true
    val gen = ++generation
    val useHw = usingHw
    val appContext = context.applicationContext

    onWorker {
      player.stop()
      closeDescriptor()
      val opened = try {
        VlcEngine.openMedia(appContext, libVLC, src)
      } catch (e: IOException) {
        postIfCurrent(gen) {
          transitioning = false
          emitError("open_failed", e.message ?: "Cannot open media")
        }
        return@onWorker
      } catch (e: SecurityException) {
        postIfCurrent(gen) {
          transitioning = false
          emitError("permission_denied", e.message ?: "No permission to read this file")
        }
        return@onWorker
      }
      descriptor = opened.descriptor
      opened.media.setHWDecoderEnabled(useHw, false)
      if (startAtMs > 0) opened.media.addOption(":start-time=${startAtMs / 1000.0}")
      player.setMedia(opened.media)
      opened.media.release()
      player.play()
      postIfCurrent(gen) { transitioning = false }
    }
  }

  private fun reloadAt(positionMs: Long) {
    loadEmitted = false
    load(positionMs)
  }

  private fun canFallBack() = usingHw && hwMode == "auto" && !fellBack

  private fun fallbackToSoftware(reason: String) {
    if (!canFallBack()) return
    fellBack = true
    val position = lastTimeMs.coerceAtLeast(0L)
    onDecoderFallback(mapOf("reason" to reason, "codec" to videoCodec, "position" to position))
    reloadAt(position)
  }

  // region libVLC events (main thread)

  private fun onPlayerEvent(event: MediaPlayer.Event) {
    if (released) return
    if (transitioning && event.type in STALE_DURING_TRANSITION) return
    when (event.type) {
      MediaPlayer.Event.Opening -> emitState("opening")
      MediaPlayer.Event.Buffering -> onBuffering(mapOf("percent" to event.buffering.toDouble()))
      MediaPlayer.Event.Playing -> onPlaying()
      MediaPlayer.Event.Paused -> {
        videoLayout.keepScreenOn = false
        emitState("paused")
      }
      MediaPlayer.Event.Stopped -> {
        videoLayout.keepScreenOn = false
        emitState("stopped")
      }
      MediaPlayer.Event.EndReached -> {
        videoLayout.keepScreenOn = false
        emitState("ended")
        onEnd(emptyMap())
      }
      MediaPlayer.Event.EncounteredError -> {
        if (canFallBack()) fallbackToSoftware("playback_error") else emitError("playback_error", "Playback failed")
      }
      MediaPlayer.Event.LengthChanged -> durationMs = event.lengthChanged
      MediaPlayer.Event.TimeChanged -> onTimeChanged(event.timeChanged)
      MediaPlayer.Event.Vout -> if (event.voutCount > 0) hasVideoOutput = true
      MediaPlayer.Event.ESAdded -> {
        if (event.esChangedType == TRACK_TYPE_VIDEO) hasVideoTrack = true
        emitTracksIfLoaded()
      }
      MediaPlayer.Event.ESDeleted, MediaPlayer.Event.ESSelected -> emitTracksIfLoaded()
    }
  }

  private fun onPlaying() {
    videoLayout.keepScreenOn = true
    emitState("playing")
    player.setVideoScale(scaleFor(aspect))
    val firstLoad = !loadEmitted
    loadEmitted = true
    val gen = generation
    val hardware = usingHw
    val settings = PlaybackSettings(paused, rate, volume, audioDelayMs, subtitleDelayMs, audioTrackId, subtitleTrackId)
    // A remembered subtitle choice wins over automatically selecting a subtitle file.
    val subtitles = loadedSource?.takeIf { firstLoad }?.let { SubtitleRequest(it, externalSubtitle, subtitleTrackId == null) }
    val appContext = context.applicationContext
    onWorker {
      subtitles?.let { addSubtitleFiles(appContext, it) }
      applyPlaybackSettings(settings)
      if (!firstLoad) return@onWorker
      val payload = loadPayload(hardware)
      postIfCurrent(gen) {
        videoCodec = payload["videoCodec"] as? String ?: ""
        applyFrameRate(payload["frameRate"] as? Double ?: 0.0)
        onLoad(payload)
      }
    }
  }

  private fun onTimeChanged(time: Long) {
    lastTimeMs = time
    if (firstTimeMs < 0) firstTimeMs = time
    // Clock advancing (audio playing) with a video track but no video output: the HW decoder produced no frames.
    if (canFallBack() && hasVideoTrack && !hasVideoOutput && time - firstTimeMs >= NO_VIDEO_OUTPUT_TIMEOUT_MS) {
      fallbackToSoftware("no_video_output")
      return
    }
    if (lastProgressMs < 0 || abs(time - lastProgressMs) >= PROGRESS_INTERVAL_MS) {
      lastProgressMs = time
      onProgress(mapOf("position" to time, "duration" to durationMs))
    }
  }

  // A view created while already in picture-in-picture (auto-play next) reports the current mode right away.
  private fun hookPictureInPicture() {
    if (pictureInPictureActivity != null) return
    val activity = appContext.currentActivity ?: return
    val filter = IntentFilter(PictureInPicture.ACTION_CONTROL)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      activity.registerReceiver(pictureInPictureControls, filter, Context.RECEIVER_NOT_EXPORTED)
    } else {
      @Suppress("UnspecifiedRegisterReceiverFlag")
      activity.registerReceiver(pictureInPictureControls, filter)
    }
    pictureInPictureActivity = activity
    refreshPictureInPicture()
  }

  private fun unhookPictureInPicture() {
    val activity = pictureInPictureActivity ?: return
    pictureInPictureActivity = null
    removeCallbacks(recheckPictureInPicture)
    try {
      activity.unregisterReceiver(pictureInPictureControls)
    } catch (_: IllegalArgumentException) {
    }
  }

  private fun refreshPictureInPicture() {
    val activity = pictureInPictureActivity ?: return
    setPictureInPicture(PictureInPicture.isActive(activity))
    removeCallbacks(recheckPictureInPicture)
    postDelayed(recheckPictureInPicture, PICTURE_IN_PICTURE_RECHECK_MS)
  }

  private fun setPictureInPicture(active: Boolean) {
    if (released || active == inPictureInPicture) return
    inPictureInPicture = active
    onPictureInPictureChange(mapOf("active" to active))
  }

  private fun applyFrameRate(fps: Double) {
    if (!matchFrameRate || frameRateApplied) return
    val activity = appContext.currentActivity ?: return
    frameRateApplied = FrameRateMatcher.apply(activity, fps)
  }

  private fun emitTracksIfLoaded() {
    if (!loadEmitted) return
    val gen = generation
    onWorker {
      val tracks = tracksPayload()
      postIfCurrent(gen) { onTracksChanged(tracks) }
    }
  }

  // endregion

  // region Worker-only helpers

  private fun applyPlaybackSettings(settings: PlaybackSettings) {
    player.setRate(settings.rate)
    player.setVolume(settings.volume)
    player.setAudioDelay(settings.audioDelayMs * 1000)
    player.setSpuDelay(settings.subtitleDelayMs * 1000)
    settings.audioTrackId?.let { player.setAudioTrack(it) }
    settings.subtitleTrackId?.let { player.setSpuTrack(it) }
    if (settings.paused && player.isPlaying) player.pause()
  }

  private fun addSubtitleFiles(appContext: Context, request: SubtitleRequest) {
    val external = request.external?.let { SubtitleFinder.resolve(appContext, it) }
    external?.let { player.addSlave(IMedia.Slave.Type.Subtitle, it, request.selectDefault) }
    SubtitleFinder.findSidecars(appContext, request.source)
      .filter { it != external }
      .forEachIndexed { index, uri ->
        player.addSlave(IMedia.Slave.Type.Subtitle, uri, request.selectDefault && external == null && index == 0)
      }
  }

  private fun loadPayload(hardware: Boolean): Map<String, Any> {
    val video = player.currentVideoTrack
    val frameRate = video?.takeIf { it.frameRateDen > 0 }?.let { it.frameRateNum.toDouble() / it.frameRateDen } ?: 0.0
    return mapOf(
      "frameRate" to frameRate,
      "duration" to player.length,
      "seekable" to player.isSeekable,
      "width" to (video?.width ?: 0),
      "height" to (video?.height ?: 0),
      "videoCodec" to (video?.codec ?: ""),
      "hardwareDecoding" to hardware,
      "tracks" to tracksPayload()
    )
  }

  private fun tracksPayload(): Map<String, Any> = mapOf(
    "audio" to describe(player.audioTracks),
    "subtitle" to describe(player.spuTracks),
    "selectedAudio" to player.audioTrack,
    "selectedSubtitle" to player.spuTrack
  )

  private fun describe(tracks: Array<MediaPlayer.TrackDescription>?): List<Map<String, Any>> =
    tracks.orEmpty().map { mapOf("id" to it.id, "name" to (it.name ?: "Track ${it.id}")) }

  private fun closeDescriptor() {
    try {
      descriptor?.close()
    } catch (_: IOException) {
    }
    descriptor = null
  }

  // endregion

  private fun onWorker(allowAfterRelease: Boolean = false, block: () -> Unit) {
    if (released && !allowAfterRelease) return
    try {
      worker.execute(block)
    } catch (_: RejectedExecutionException) {
    }
  }

  private fun postIfCurrent(gen: Int, block: () -> Unit) {
    mainHandler.post {
      if (!released && gen == generation) block()
    }
  }

  private fun scaleFor(mode: String) = when (mode) {
    "fill" -> MediaPlayer.ScaleType.SURFACE_FILL
    "fitScreen" -> MediaPlayer.ScaleType.SURFACE_FIT_SCREEN
    "16:9" -> MediaPlayer.ScaleType.SURFACE_16_9
    "4:3" -> MediaPlayer.ScaleType.SURFACE_4_3
    "original" -> MediaPlayer.ScaleType.SURFACE_ORIGINAL
    else -> MediaPlayer.ScaleType.SURFACE_BEST_FIT
  }

  private fun emitState(state: String) = onPlaybackStateChange(mapOf("state" to state))

  private fun emitError(code: String, message: String) = onError(mapOf("code" to code, "message" to message))

  companion object {
    private const val NO_VIDEO_OUTPUT_TIMEOUT_MS = 3000L
    private const val PROGRESS_INTERVAL_MS = 250L
    private const val WORKER_CALL_TIMEOUT_S = 5L
    private const val MAX_ZOOM = 4f
    private const val PICTURE_IN_PICTURE_RECHECK_MS = 400L
    private const val TRACK_TYPE_VIDEO = 1 // libvlc_track_video

    // Events from the media being torn down; ignore them while a new one is loading.
    private val STALE_DURING_TRANSITION = setOf(
      MediaPlayer.Event.Paused,
      MediaPlayer.Event.Stopped,
      MediaPlayer.Event.EndReached,
      MediaPlayer.Event.EncounteredError,
      MediaPlayer.Event.TimeChanged
    )
  }
}
