package expo.modules.vlcplayer.cast

import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.wifi.WifiManager
import android.os.Build
import android.os.IBinder
import android.util.Log

/**
 * Keeps casting alive while the phone screen is off or another app is open, holds Wi-Fi awake, and shows the address,
 * code and a Stop button. The server itself lives in [CastSession].
 */
class CastService : Service() {
  private var wifiLock: WifiManager.WifiLock? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
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
    // After the process dies the server is gone too, so a restarted service would have nothing to keep alive.
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    wifiLock?.takeIf { it.isHeld }?.release()
    wifiLock = null
    stopForeground(STOP_FOREGROUND_REMOVE)
    super.onDestroy()
  }

  private fun showNotification(): Boolean = try {
    val notification = CastNotification.build(this, CastSession.snapshot())
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(CastNotification.ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
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

  companion object {
    const val ACTION_STOP = "expo.modules.vlcplayer.cast.STOP"

    private const val TAG = "CastService"
    private const val WIFI_LOCK_TAG = "LuckyPlayer:cast"

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
