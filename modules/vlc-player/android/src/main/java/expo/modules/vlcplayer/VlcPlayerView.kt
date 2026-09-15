package expo.modules.vlcplayer

import android.app.Activity
import android.content.Context
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.os.ParcelFileDescriptor
import android.util.Log
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
  private val onPlaybackControl by EventDispatcher<Map<String, Any>>()

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
  /** Step for picture-in-picture and headset skip buttons. */
  var skipSeconds = 10

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

  // Audio never plays while the player is hidden. Every automatic pause, resume and button press is decided here,
  // on the native side, so it works even when JS is slow in the background; JS only mirrors the result.
  private var playbackHost: PlaybackHost? = null
  private var mediaButtons: MediaButtons? = null
  private val audioFocus = PlaybackAudioFocus(context) { change -> onAudioFocusChange(change) }
  private var hostVisible = true
  // Paused by a call, alarm or assistant; resumes when it ends if the player is still visible.
  private var pausedForInterruption = false
  // Media stopped while hidden (the video surface does not survive); reopened, paused, at this position when shown.
  private var mediaReleased = false
  private var reopenAtMs = 0L

  // Set between the activity stopping and starting again.
  private var activityStopped = false

  private val hostListener = object : PlaybackHost.Listener {
    // XOS stops and restarts the activity a few times while the picture-in-picture window opens. When that window
    // is about to open, the stop only counts if it still holds shortly after and the window is not showing.
    override fun onHostHidden() {
      activityStopped = true
      val activity = pictureInPictureActivity
      if (activity != null && !paused && PictureInPicture.isAutoEnterArmed(activity)) {
        removeCallbacks(confirmWindowHidden)
        postDelayed(confirmWindowHidden, PICTURE_IN_PICTURE_HIDE_CONFIRM_MS)
      } else {
        hideNow("activity stopped")
      }
    }

    override fun onHostShown() {
      activityStopped = false
      removeCallbacks(confirmWindowHidden)
      if (hostVisible || released) return
      Log.i(TAG, "Player shown")
      hostVisible = true
      mediaButtons?.setActive(true)
      attachVideoSurface()
      if (mediaReleased) reopenAfterHidden()
    }

    override fun onAudioMustStop() = stopAudioAutomatically("screen off or headphones disconnected")

    override fun onPictureInPictureControl(control: String) = applyControl(control)
  }

  // A deferred hide (activity stopped or window hidden while picture-in-picture may be opening) acts only if the
  // player is still hidden and picture-in-picture is not showing.
  private val confirmWindowHidden = Runnable {
    val activity = pictureInPictureActivity ?: return@Runnable
    val stillHidden = activityStopped || windowVisibility != VISIBLE
    if (!stillHidden || PictureInPicture.isActive(activity)) return@Runnable
    hideNow(if (activityStopped) "activity stopped" else "window hidden")
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

  // Backup for activity callbacks that arrive late; see [confirmWindowHidden].
  override fun onWindowVisibilityChanged(visibility: Int) {
    super.onWindowVisibilityChanged(visibility)
    if (pictureInPictureActivity == null || released) return
    removeCallbacks(confirmWindowHidden)
    if (visibility == VISIBLE) {
      hostListener.onHostShown()
    } else {
      postDelayed(confirmWindowHidden, WINDOW_HIDE_CONFIRM_MS)
    }
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    if (released) return
    hookHost()
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

  /** JS prop. A value different from the player's state is the user's choice and ends any automatic resume. */
  fun setPausedFromProps(value: Boolean?) {
    val next = value ?: false
    if (next == paused) return
    Log.i(TAG, "JS set paused=$next")
    pausedForInterruption = false
    if (next) {
      setPaused(true)
      audioFocus.abandon()
    } else {
      play("user")
    }
  }

  fun setPaused(value: Boolean?) {
    paused = value ?: false
    mediaButtons?.setPlaying(!paused)
    pictureInPictureActivity?.let { PictureInPicture.setPlayback(it, paused, skipSeconds) }
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

  // region Playback safety (main thread)

  /** Starts playback only while visible and with audio focus. Returns false and reports why when refused. */
  private fun play(reason: String): Boolean {
    Log.i(TAG, "Play requested by $reason (visible=$hostVisible)")
    if (!hostVisible) {
      setPaused(true)
      emitControl(PlaybackControls.PAUSE)
      return false
    }
    if (!audioFocus.request()) {
      setPaused(true)
      emitControl(PlaybackControls.BLOCKED)
      return false
    }
    setPaused(false)
    return true
  }

  private fun pauseAutomatically(reason: String) {
    if (paused) return
    Log.i(TAG, "Paused automatically: $reason")
    setPaused(true)
    emitControl(PlaybackControls.PAUSE)
  }

  private fun stopAudioAutomatically(reason: String) {
    pausedForInterruption = false
    pauseAutomatically(reason)
    audioFocus.abandon()
  }

  /** Pauses, stops the media and lets go of the surface. The media reopens paused when the player is shown again. */
  private fun hideNow(reason: String) {
    removeCallbacks(confirmWindowHidden)
    if (!hostVisible || released) return
    Log.i(TAG, "Player hidden: $reason")
    hostVisible = false
    mediaButtons?.setActive(false)
    stopAudioAutomatically("player hidden")
    releaseMediaWhileHidden()
    detachVideoSurface()
  }

  // A paused libVLC does not recover its video output after the surface is destroyed and recreated (audio returns,
  // picture stays black), so the media is stopped here and reopened from the saved position instead.
  private fun releaseMediaWhileHidden() {
    if (mediaReleased || loadedSource == null) return
    reopenAtMs = lastTimeMs.coerceAtLeast(0L)
    Log.i(TAG, "Stopping media while hidden at $reopenAtMs ms")
    mediaReleased = true
    loadEmitted = false
    generation++
    onWorker {
      player.stop()
      closeDescriptor()
    }
  }

  private fun reopenAfterHidden() {
    mediaReleased = false
    if (viewsAttached && source != null) load(reopenAtMs)
  }

  private fun detachVideoSurface() {
    if (!viewsAttached) return
    player.detachViews()
    viewsAttached = false
  }

  private fun attachVideoSurface() {
    if (viewsAttached) return
    player.attachViews(videoLayout, null, true, false)
    viewsAttached = true
  }

  private fun onAudioFocusChange(change: PlaybackAudioFocus.Change) {
    if (released) return
    Log.i(TAG, "Audio focus: $change")
    when (change) {
      PlaybackAudioFocus.Change.LOSS -> stopAudioAutomatically("another app took the audio")
      PlaybackAudioFocus.Change.LOSS_TRANSIENT -> if (!paused) {
        pauseAutomatically("call, alarm or assistant")
        pausedForInterruption = true
      }
      PlaybackAudioFocus.Change.GAIN -> if (pausedForInterruption) {
        pausedForInterruption = false
        if (hostVisible && play("interruption ended")) emitControl(PlaybackControls.PLAY)
      }
    }
  }

  /** Picture-in-picture window buttons and headset or Bluetooth buttons. */
  private fun applyControl(control: String) {
    if (released) return
    Log.i(TAG, "Playback control: $control")
    when (control) {
      PlaybackControls.TOGGLE -> if (paused) userPlay() else userPause()
      PlaybackControls.PLAY -> if (paused) userPlay()
      PlaybackControls.PAUSE -> if (!paused) userPause()
      PlaybackControls.REWIND -> skipBy(-skipSeconds * 1000L)
      PlaybackControls.FORWARD -> skipBy(skipSeconds * 1000L)
      else -> return
    }
    emitControl(control)
  }

  private fun userPlay() {
    pausedForInterruption = false
    play("button")
  }

  private fun userPause() {
    pausedForInterruption = false
    setPaused(true)
    audioFocus.abandon()
  }

  private fun emitControl(action: String) = onPlaybackControl(mapOf("action" to action, "paused" to paused))

  // endregion

  private fun skipBy(deltaMs: Long) {
    onWorker {
      if (!player.hasMedia()) return@onWorker
      val length = player.length
      val target = (player.time + deltaMs).coerceAtLeast(0L)
      player.setTime(if (length > 0) target.coerceAtMost(length) else target)
    }
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
    unhookHost()
    audioFocus.abandon()
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
    if (!paused && !(hostVisible && audioFocus.request())) {
      paused = true
      mediaButtons?.setPlaying(false)
      emitControl(if (hostVisible) PlaybackControls.BLOCKED else PlaybackControls.PAUSE)
    }
    // libVLC has to start playing before it can be paused; a paused load stays muted until the pause lands.
    val startPaused = paused
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
      if (startPaused) player.setVolume(0)
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
  private fun hookHost() {
    if (pictureInPictureActivity != null) return
    val activity = appContext.currentActivity ?: return
    pictureInPictureActivity = activity
    playbackHost = PlaybackHost(activity, hostListener).also { it.start() }
    mediaButtons = MediaButtons(activity) { control -> applyControl(control) }.also {
      it.setPlaying(!paused)
      it.setActive(hostVisible)
    }
    refreshPictureInPicture()
  }

  private fun unhookHost() {
    pictureInPictureActivity = null
    removeCallbacks(recheckPictureInPicture)
    removeCallbacks(confirmWindowHidden)
    playbackHost?.stop()
    playbackHost = null
    mediaButtons?.release()
    mediaButtons = null
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
    // Pause before restoring the volume so a paused load never makes a sound.
    if (settings.paused && player.isPlaying) player.pause()
    player.setRate(settings.rate)
    player.setVolume(settings.volume)
    player.setAudioDelay(settings.audioDelayMs * 1000)
    player.setSpuDelay(settings.subtitleDelayMs * 1000)
    settings.audioTrackId?.let { player.setAudioTrack(it) }
    settings.subtitleTrackId?.let { player.setSpuTrack(it) }
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
    private const val TAG = "VlcPlayerView"
    private const val NO_VIDEO_OUTPUT_TIMEOUT_MS = 3000L
    private const val PROGRESS_INTERVAL_MS = 250L
    private const val WORKER_CALL_TIMEOUT_S = 5L
    private const val MAX_ZOOM = 4f
    private const val PICTURE_IN_PICTURE_RECHECK_MS = 400L
    private const val WINDOW_HIDE_CONFIRM_MS = 400L
    private const val PICTURE_IN_PICTURE_HIDE_CONFIRM_MS = 800L
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
