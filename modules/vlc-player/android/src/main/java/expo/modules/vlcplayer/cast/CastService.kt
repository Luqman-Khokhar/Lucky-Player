package expo.modules.vlcplayer.cast

import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.projection.MediaProjectionManager
import android.net.wifi.WifiManager
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.util.Log

/**
 * Keeps casting alive while the phone screen is off or another app is open, holds Wi-Fi awake, and shows the address,
 * code and a Stop button. The server itself lives in [CastSession].
 */
class CastService : Service() {
  private var wifiLock: WifiManager.WifiLock? = null
  private var wakeLock: PowerManager.WakeLock? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    // Screen capture may only start once this service runs with the projection type, so that happens here first.
    if (intent?.action == ACTION_PROJECTION && intent.hasExtra(EXTRA_RESULT_DATA)) {
      projecting.set(true)
      if (!showNotification()) {
        projecting.set(false)
        CastSession.reportScreenCastFailure(intent.getStringExtra(EXTRA_RECEIVER_ID).orEmpty(), NOTIFICATION_REFUSED)
        return START_NOT_STICKY
      }
      holdWifi()
      holdCpu()
      startProjection(intent)
      return START_NOT_STICKY
    }
    // A service started with startForegroundService must call startForeground even when it is about to stop.
    val shown = showNotification()
    if (intent?.action == ACTION_STOP) {
      CastSession.stop(this)
      return START_NOT_STICKY
    }
    if (!shown || CastSession.snapshot()["running"] != true) {
      stopForeground(STOP_FOREGROUND_REMOVE)
      stopSelf()
      return START_NOT_STICKY
    }
    holdWifi()
    holdCpu()
    // After the process dies the server is gone too, so a restarted service would have nothing to keep alive.
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    wifiLock?.takeIf { it.isHeld }?.release()
    wifiLock = null
    wakeLock?.takeIf { it.isHeld }?.release()
    wakeLock = null
    stopForeground(STOP_FOREGROUND_REMOVE)
    super.onDestroy()
  }

  private fun showNotification(): Boolean = try {
    val notification = CastNotification.build(this, CastSession.snapshot())
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      // The projection type may only be claimed while a screen capture is actually running.
      val types = if (projecting.get()) {
        ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK or ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION
      } else {
        ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
      }
      startForeground(CastNotification.ID, notification, types)
    } else {
      startForeground(CastNotification.ID, notification)
    }
    true
  } catch (e: RuntimeException) {
    // Android 12+ can refuse a foreground start from the background (ForegroundServiceStartNotAllowedException).
    Log.w(TAG, "Could not show the cast notification", e)
    false
  }

  // Without it, Wi-Fi power saving delays packets by hundreds of milliseconds while the screen is off.
  @Suppress("DEPRECATION")
  private fun holdWifi() {
    if (wifiLock?.isHeld == true) return
    val manager = applicationContext.getSystemService(WifiManager::class.java) ?: return
    val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      WifiManager.WIFI_MODE_FULL_LOW_LATENCY
    } else {
      WifiManager.WIFI_MODE_FULL_HIGH_PERF
    }
    wifiLock = manager.createWifiLock(mode, WIFI_LOCK_TAG).apply {
      setReferenceCounted(false)
      acquire()
    }
  }

  // The projection is built here, inside the service, so it cannot run before the service type is in place.
  private fun startProjection(intent: Intent) {
    val resultCode = intent.getIntExtra(EXTRA_RESULT_CODE, RESULT_CANCELED)
    val data: Intent? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      intent.getParcelableExtra(EXTRA_RESULT_DATA, Intent::class.java)
    } else {
      @Suppress("DEPRECATION")
      intent.getParcelableExtra(EXTRA_RESULT_DATA)
    }
    val receiverId = intent.getStringExtra(EXTRA_RECEIVER_ID).orEmpty()
    val withAudio = intent.getBooleanExtra(EXTRA_WITH_AUDIO, false)
    val manager = getSystemService(MediaProjectionManager::class.java)
    if (data == null || manager == null) {
      projecting.set(false)
      CastSession.reportScreenCastFailure(receiverId, "The phone couldn't start screen sharing.")
      return
    }
    val application = applicationContext
    Thread({
      try {
        val projection = manager.getMediaProjection(resultCode, data)
        if (projection == null) {
          projecting.set(false)
          CastSession.reportScreenCastFailure(receiverId, "Screen sharing was not allowed.")
          return@Thread
        }
        CastSession.startScreenCast(application, receiverId, projection, withAudio)
      } catch (e: CastSession.CastException) {
        projecting.set(false)
        CastSession.reportScreenCastFailure(receiverId, e.message ?: "The phone couldn't start screen sharing.")
      } catch (e: RuntimeException) {
        Log.w(TAG, "Screen sharing failed to start", e)
        projecting.set(false)
        CastSession.reportScreenCastFailure(receiverId, "The phone couldn't start screen sharing.")
      }
    }, "cast-projection").apply { isDaemon = true }.start()
  }

  // Serving and converting video have to keep running while the phone's screen is off.
  private fun holdCpu() {
    if (wakeLock?.isHeld == true) return
    val manager = applicationContext.getSystemService(PowerManager::class.java) ?: return
    wakeLock = manager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, WAKE_LOCK_TAG).apply {
      setReferenceCounted(false)
      acquire()
    }
  }

  companion object {
    const val ACTION_STOP = "expo.modules.vlcplayer.cast.STOP"
    private const val ACTION_PROJECTION = "expo.modules.vlcplayer.cast.PROJECTION"
    private const val ACTION_STOP_PROJECTION = "expo.modules.vlcplayer.cast.STOP_PROJECTION"

    private const val EXTRA_RESULT_CODE = "resultCode"
    private const val EXTRA_RESULT_DATA = "resultData"
    private const val EXTRA_RECEIVER_ID = "receiverId"
    private const val EXTRA_WITH_AUDIO = "withAudio"
    private const val RESULT_CANCELED = 0
    private const val NOTIFICATION_REFUSED =
      "Android would not show the casting notification, which screen sharing needs. Allow notifications for Lucky Player."

    private val projecting = java.util.concurrent.atomic.AtomicBoolean(false)

    /**
     * Hands Android's screen-capture answer to the service, which claims the projection service type before the
     * capture starts. Doing this in the app would race the service and fail on Android 14 and later.
     */
    fun startProjection(context: Context, resultCode: Int, data: Intent, receiverId: String, withAudio: Boolean) {
      val intent = Intent(context, CastService::class.java)
        .setAction(ACTION_PROJECTION)
        .putExtra(EXTRA_RESULT_CODE, resultCode)
        .putExtra(EXTRA_RESULT_DATA, data)
        .putExtra(EXTRA_RECEIVER_ID, receiverId)
        .putExtra(EXTRA_WITH_AUDIO, withAudio)
      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          context.startForegroundService(intent)
        } else {
          context.startService(intent)
        }
      } catch (e: IllegalStateException) {
        Log.w(TAG, "Could not start screen sharing", e)
        CastSession.reportScreenCastFailure(receiverId, "The phone couldn't start screen sharing.")
      }
    }

    /** Drops the screen-capture service type once a capture has stopped. */
    fun setProjecting(context: Context, active: Boolean) {
      if (!projecting.compareAndSet(!active, active)) return
      val intent = Intent(context, CastService::class.java).setAction(ACTION_STOP_PROJECTION)
      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          context.startForegroundService(intent)
        } else {
          context.startService(intent)
        }
      } catch (e: IllegalStateException) {
        Log.w(TAG, "Could not update the cast service type", e)
      }
    }

    private const val TAG = "CastService"
    private const val WIFI_LOCK_TAG = "LuckyPlayer:cast"
    private const val WAKE_LOCK_TAG = "LuckyPlayer:cast-cpu"

    fun start(context: Context) {
      val intent = Intent(context, CastService::class.java)
      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent) else context.startService(intent)
      } catch (e: IllegalStateException) {
        Log.w(TAG, "Could not start the cast service", e)
      }
    }

    fun stop(context: Context) {
      context.stopService(Intent(context, CastService::class.java))
    }
  }
}
