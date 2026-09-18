package expo.modules.vlcplayer

import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.media.AudioManager
import android.os.Build
import android.os.IBinder
import android.util.Log

/**
 * Keeps music playing while the app is in the background. The player itself lives in [AudioPlayback]; this service
 * exists to hold the foreground notification and to catch headphones being unplugged.
 */
class AudioPlaybackService : Service() {
  private var noisyRegistered = false

  private val noisyReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context?, intent: Intent?) {
      if (intent?.action == AudioManager.ACTION_AUDIO_BECOMING_NOISY) AudioPlayback.onBecomingNoisy()
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    AudioPlayback.notificationListener = { refresh() }
    registerReceiver(noisyReceiver, IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY))
    noisyRegistered = true
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_PLAY -> AudioPlayback.play()
      ACTION_PAUSE -> AudioPlayback.pause()
      ACTION_TOGGLE -> AudioPlayback.toggle()
      ACTION_NEXT -> AudioPlayback.next()
      ACTION_PREVIOUS -> AudioPlayback.previous()
      ACTION_STOP -> {
        AudioPlayback.stop()
        return START_NOT_STICKY
      }
    }
    // A service started with startForegroundService must call startForeground even when it is about to stop.
    if (!showNotification()) {
      stopSelf()
      return START_NOT_STICKY
    }
    if (!AudioPlayback.isActive) {
      stopForeground(STOP_FOREGROUND_REMOVE)
      stopSelf()
      return START_NOT_STICKY
    }
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    if (noisyRegistered) {
      try {
        unregisterReceiver(noisyReceiver)
      } catch (_: IllegalArgumentException) {
      }
      noisyRegistered = false
    }
    AudioPlayback.notificationListener = null
    super.onDestroy()
  }

  override fun onTaskRemoved(rootIntent: Intent?) {
    // Swiping the app away while paused should not leave a dead notification behind.
    if (!AudioPlayback.isPlaying) AudioPlayback.stop()
    super.onTaskRemoved(rootIntent)
  }

  private fun refresh() {
    if (!AudioPlayback.isActive) {
      stopForeground(STOP_FOREGROUND_REMOVE)
      stopSelf()
      return
    }
    showNotification()
  }

  private fun showNotification(): Boolean = try {
    val notification = AudioNotification.build(this)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(AudioNotification.ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
    } else {
      startForeground(AudioNotification.ID, notification)
    }
    true
  } catch (e: RuntimeException) {
    // Android 12+ can refuse a start from the background (ForegroundServiceStartNotAllowedException).
    Log.w(TAG, "Could not show the playback notification", e)
    false
  }

  companion object {
    const val ACTION_SYNC = "expo.modules.vlcplayer.audio.SYNC"
    const val ACTION_PLAY = "expo.modules.vlcplayer.audio.PLAY"
    const val ACTION_PAUSE = "expo.modules.vlcplayer.audio.PAUSE"
    const val ACTION_TOGGLE = "expo.modules.vlcplayer.audio.TOGGLE"
    const val ACTION_NEXT = "expo.modules.vlcplayer.audio.NEXT"
    const val ACTION_PREVIOUS = "expo.modules.vlcplayer.audio.PREVIOUS"
    const val ACTION_STOP = "expo.modules.vlcplayer.audio.STOP"

    private const val TAG = "AudioPlaybackService"

    fun start(context: Context) {
      val intent = context.audioServiceIntent(ACTION_SYNC)
      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          context.startForegroundService(intent)
        } else {
          context.startService(intent)
        }
      } catch (e: RuntimeException) {
        Log.w(TAG, "Could not start the playback service", e)
      }
    }

    fun stop(context: Context) {
      try {
        context.stopService(context.audioServiceIntent(ACTION_SYNC))
      } catch (e: RuntimeException) {
        Log.w(TAG, "Could not stop the playback service", e)
      }
    }
  }
}
