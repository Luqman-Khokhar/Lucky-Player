package expo.modules.vlcplayer

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Context
import android.net.Uri
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.Executors

class VlcPlayerModule : Module() {
  private val context: Context
    get() = requireNotNull(appContext.reactContext) { "React context is not available" }

  private var pendingPick: Promise? = null
  private var pendingFolderPick: Promise? = null
  private var pendingSubtitlePick: Promise? = null

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

    AsyncFunction("trimThumbnailCache") { maxBytes: Double, promise: Promise ->
      val appContext = context
      thumbnailExecutor.execute {
        promise.resolve(ThumbnailCache.trim(appContext, maxBytes.toLong()).toDouble())
      }
    }

    AsyncFunction("pickFolder") { promise: Promise ->
      if (pendingFolderPick != null) {
        promise.reject("ERR_PICK_IN_PROGRESS", "A folder picker is already open", null)
        return@AsyncFunction
      }
      val activity = appContext.throwingActivity
      pendingFolderPick = promise
      val launched = FolderSources.createIntents().any { intent ->
        try {
          activity.startActivityForResult(intent, FolderSources.REQUEST_CODE)
          true
        } catch (_: ActivityNotFoundException) {
          false
        }
      }
      if (!launched) {
        pendingFolderPick = null
        promise.reject("ERR_NO_PICKER", "No folder picker is available on this device", null)
      }
    }

    AsyncFunction("scanFolder") { treeUri: String, promise: Promise ->
      val appContext = context
      scanExecutor.execute {
        try {
          promise.resolve(FolderSources.scan(appContext, Uri.parse(treeUri)))
        } catch (e: SecurityException) {
          promise.reject("ERR_PERMISSION", "Access to this folder was lost", e)
        } catch (e: Exception) {
          promise.reject("ERR_SCAN", e.message ?: "Could not scan the folder", e)
        }
      }
    }

    AsyncFunction("releaseFolder") { treeUri: String ->
      FolderSources.release(context, Uri.parse(treeUri))
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

    AsyncFunction("pickSubtitle") { promise: Promise ->
      if (pendingSubtitlePick != null) {
        promise.reject("ERR_PICK_IN_PROGRESS", "A file picker is already open", null)
        return@AsyncFunction
      }
      val activity = appContext.throwingActivity
      pendingSubtitlePick = promise
      val launched = SubtitleFinder.createPickerIntents().any { intent ->
        try {
          activity.startActivityForResult(intent, SubtitleFinder.REQUEST_CODE)
          true
        } catch (_: ActivityNotFoundException) {
          false
        }
      }
      if (!launched) {
        pendingSubtitlePick = null
        promise.reject("ERR_NO_PICKER", "No file picker app is available on this device", null)
      }
    }

    OnActivityResult { _, (requestCode, resultCode, intent) ->
      if (requestCode == SubtitleFinder.REQUEST_CODE) {
        val subtitlePromise = pendingSubtitlePick ?: return@OnActivityResult
        pendingSubtitlePick = null
        val uri = intent?.data
        if (resultCode != Activity.RESULT_OK || uri == null) {
          subtitlePromise.resolve(null)
        } else {
          val persisted = VideoPicker.persistReadAccess(context, uri)
          subtitlePromise.resolve(VideoPicker.describe(context, uri, persisted))
        }
        return@OnActivityResult
      }
      if (requestCode == FolderSources.REQUEST_CODE) {
        val folderPromise = pendingFolderPick ?: return@OnActivityResult
        pendingFolderPick = null
        val treeUri = intent?.data
        when {
          resultCode != Activity.RESULT_OK || treeUri == null -> folderPromise.resolve(null)
          !FolderSources.persist(context, treeUri) ->
            folderPromise.reject("ERR_PERMISSION", "Android did not allow lasting access to this folder", null)
          else -> folderPromise.resolve(FolderSources.describe(context, treeUri))
        }
        return@OnActivityResult
      }
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

    AsyncFunction("warmUp") {
      VlcEngine.warmUp(context)
    }

    AsyncFunction("configureSubtitles") { scale: Int, color: Int, background: Boolean ->
      VlcEngine.configureSubtitles(context, scale, color, background)
    }

    Function("isPictureInPictureSupported") {
      PictureInPicture.isSupported(context)
    }

    AsyncFunction("enterPictureInPicture") { width: Int, height: Int, promise: Promise ->
      val activity = appContext.throwingActivity
      activity.runOnUiThread { promise.resolve(PictureInPicture.enter(activity, width, height)) }
    }

    AsyncFunction("setAutoPictureInPicture") { enabled: Boolean, width: Int, height: Int ->
      val activity = appContext.currentActivity ?: return@AsyncFunction
      activity.runOnUiThread { PictureInPicture.setAutoEnter(activity, enabled, width, height) }
    }

    AsyncFunction("setPictureInPicturePlayback") { paused: Boolean, skipSeconds: Int ->
      val activity = appContext.currentActivity ?: return@AsyncFunction
      activity.runOnUiThread { PictureInPicture.setPlayback(activity, paused, skipSeconds) }
    }

    AsyncFunction("openPictureInPictureSettings") {
      PictureInPicture.openSettings(context)
    }

    AsyncFunction("getDeviceProfile") {
      DeviceProfiler.profile(context)
    }

    AsyncFunction("getMediaInfo") { uri: String ->
      MediaProbe.probe(context, uri)
    }

    AsyncFunction("getBrightness") {
      SystemControls.getBrightness(appContext.throwingActivity)
    }

    AsyncFunction("setBrightness") { value: Double ->
      SystemControls.setBrightness(appContext.throwingActivity, value)
    }

    AsyncFunction("getMediaVolume") {
      SystemControls.getVolume(context)
    }

    AsyncFunction("setMediaVolume") { index: Int ->
      SystemControls.setVolume(context, index)
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
        "onTracksChanged",
        "onPictureInPictureChange",
        "onPlaybackControl"
      )

      Prop("source") { view: VlcPlayerView, source: String? -> view.source = source }
      Prop("startPosition") { view: VlcPlayerView, ms: Double? -> view.startPositionMs = ms?.toLong() ?: 0L }
      Prop("externalSubtitle") { view: VlcPlayerView, uri: String? -> view.externalSubtitle = uri }
      Prop("matchFrameRate") { view: VlcPlayerView, enabled: Boolean? -> view.matchFrameRate = enabled ?: true }
      Prop("skipSeconds") { view: VlcPlayerView, seconds: Int? -> view.skipSeconds = seconds ?: 10 }
      Prop("paused") { view: VlcPlayerView, paused: Boolean? -> view.setPausedFromProps(paused) }
      Prop("rate") { view: VlcPlayerView, rate: Float? -> view.setRate(rate) }
      Prop("volume") { view: VlcPlayerView, volume: Int? -> view.setVolume(volume) }
      Prop("aspect") { view: VlcPlayerView, aspect: String? -> view.setAspect(aspect) }
      Prop("zoom") { view: VlcPlayerView, zoom: Float? -> view.setZoom(zoom) }
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
