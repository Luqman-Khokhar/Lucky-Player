package expo.modules.vlcplayer

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Context
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.Executors

class VlcPlayerModule : Module() {
  private val context: Context
    get() = requireNotNull(appContext.reactContext) { "React context is not available" }

  private var pendingPick: Promise? = null

  private val scanExecutor = Executors.newSingleThreadExecutor()

  // Two decoders at most: keeps MediaTek chips responsive while the list scrolls.
  private val thumbnailExecutor = Executors.newFixedThreadPool(2)

  override fun definition() = ModuleDefinition {
    Name("VlcPlayer")

    AsyncFunction("scanVideos") { promise: Promise ->
      val appContext = context
      scanExecutor.execute {
        try {
          promise.resolve(MediaScanner.scanVideos(appContext))
        } catch (e: SecurityException) {
          promise.reject("ERR_PERMISSION", "Video access is not granted", e)
        } catch (e: Exception) {
          promise.reject("ERR_SCAN", e.message ?: "Could not scan videos", e)
        }
      }
    }

    AsyncFunction("getThumbnail") { uri: String, key: String, width: Int, promise: Promise ->
      val appContext = context
      thumbnailExecutor.execute {
        promise.resolve(ThumbnailCache.get(appContext, uri, key, width))
      }
    }

    AsyncFunction("pickVideo") { promise: Promise ->
      if (pendingPick != null) {
        promise.reject("ERR_PICK_IN_PROGRESS", "A file picker is already open", null)
        return@AsyncFunction
      }
      val activity = appContext.throwingActivity
      pendingPick = promise
      val launched = VideoPicker.createIntents().any { intent ->
        try {
          activity.startActivityForResult(intent, VideoPicker.REQUEST_CODE)
          true
        } catch (_: ActivityNotFoundException) {
          false
        }
      }
      if (!launched) {
        pendingPick = null
        promise.reject("ERR_NO_PICKER", "No file picker app is available on this device", null)
      }
    }

    OnActivityResult { _, (requestCode, resultCode, intent) ->
      if (requestCode != VideoPicker.REQUEST_CODE) return@OnActivityResult
      val promise = pendingPick ?: return@OnActivityResult
      pendingPick = null
      val uri = intent?.data
      if (resultCode != Activity.RESULT_OK || uri == null) {
        promise.resolve(null)
        return@OnActivityResult
      }
      val persisted = VideoPicker.persistReadAccess(context, uri)
      promise.resolve(VideoPicker.describe(context, uri, persisted))
    }

    AsyncFunction("getDeviceProfile") {
      DeviceProfiler.profile(context)
    }

    AsyncFunction("getMediaInfo") { uri: String ->
      MediaProbe.probe(context, uri)
    }

    View(VlcPlayerView::class) {
      Events(
        "onLoad",
        "onProgress",
        "onBuffering",
        "onPlaybackStateChange",
        "onEnd",
        "onError",
        "onDecoderFallback",
        "onTracksChanged"
      )

      Prop("source") { view: VlcPlayerView, source: String? -> view.source = source }
      Prop("startPosition") { view: VlcPlayerView, ms: Double? -> view.startPositionMs = ms?.toLong() ?: 0L }
      Prop("paused") { view: VlcPlayerView, paused: Boolean? -> view.setPaused(paused) }
      Prop("rate") { view: VlcPlayerView, rate: Float? -> view.setRate(rate) }
      Prop("volume") { view: VlcPlayerView, volume: Int? -> view.setVolume(volume) }
      Prop("aspect") { view: VlcPlayerView, aspect: String? -> view.setAspect(aspect) }
      Prop("hwDecoding") { view: VlcPlayerView, mode: String? -> view.setHwMode(mode) }
      Prop("audioTrack") { view: VlcPlayerView, id: Int? -> view.setAudioTrack(id) }
      Prop("subtitleTrack") { view: VlcPlayerView, id: Int? -> view.setSubtitleTrack(id) }
      Prop("audioDelay") { view: VlcPlayerView, ms: Double? -> view.setAudioDelay(ms?.toLong()) }
      Prop("subtitleDelay") { view: VlcPlayerView, ms: Double? -> view.setSubtitleDelay(ms?.toLong()) }

      OnViewDidUpdateProps { view: VlcPlayerView -> view.commit() }

      AsyncFunction("seek") { view: VlcPlayerView, positionMs: Double -> view.seek(positionMs.toLong()) }
      AsyncFunction("addSubtitle") { view: VlcPlayerView, uri: String -> view.addSubtitle(uri) }

      OnViewDestroys { view: VlcPlayerView -> view.release() }
    }
  }
}
