package expo.modules.vlcplayer

import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log

/**
 * Keeps the app process, and with it the global volume boost and equalizer, alive while other apps play, and shows
 * the controls notification. It plays no audio itself.
 */
class SoundEffectsService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_BOOST_DOWN -> SoundEffectsController.boostBy(this, -SoundEffectsController.BOOST_STEP_PERCENT)
      ACTION_BOOST_UP -> SoundEffectsController.boostBy(this, SoundEffectsController.BOOST_STEP_PERCENT)
      ACTION_NEXT_PRESET -> SoundEffectsController.stepPreset(this, 1)
      ACTION_PREVIOUS_PRESET -> SoundEffectsController.stepPreset(this, -1)
      ACTION_TOGGLE_BOOST -> SoundEffectsController.toggleBoost(this)
      ACTION_TOGGLE_EQUALIZER -> SoundEffectsController.toggleEqualizer(this)
      ACTION_OFF -> SoundEffectsController.turnOff(this)
      // A null intent means Android restarted the service after killing the process; the effects died with it.
      null -> SoundEffectsController.reapply(this)
    }
    // A service started with startForegroundService must call startForeground even when it is about to stop.
    if (!showNotification()) {
      stopSelf()
      return START_NOT_STICKY
    }
    if (!SoundEffectsController.isActive(this)) {
      stopForeground(STOP_FOREGROUND_REMOVE)
      stopSelf()
      return START_NOT_STICKY
    }
    return START_STICKY
  }

  private fun showNotification(): Boolean = try {
    val notification = SoundNotification.build(
      this,
      SoundEffectsController.snapshot(this),
      SoundEffectsController.summary(this)
    )
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      startForeground(SoundNotification.ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
    } else {
      startForeground(SoundNotification.ID, notification)
    }
    true
  } catch (e: RuntimeException) {
    // Android 12+ can refuse a restart from the background (ForegroundServiceStartNotAllowedException).
    Log.w(TAG, "Could not show the sound notification", e)
    false
  }

  companion object {
    const val ACTION_REFRESH = "expo.modules.vlcplayer.sound.REFRESH"
    const val ACTION_BOOST_DOWN = "expo.modules.vlcplayer.sound.BOOST_DOWN"
    const val ACTION_BOOST_UP = "expo.modules.vlcplayer.sound.BOOST_UP"
    const val ACTION_NEXT_PRESET = "expo.modules.vlcplayer.sound.NEXT_PRESET"
    const val ACTION_PREVIOUS_PRESET = "expo.modules.vlcplayer.sound.PREVIOUS_PRESET"
    const val ACTION_TOGGLE_BOOST = "expo.modules.vlcplayer.sound.TOGGLE_BOOST"
    const val ACTION_TOGGLE_EQUALIZER = "expo.modules.vlcplayer.sound.TOGGLE_EQUALIZER"
    const val ACTION_OFF = "expo.modules.vlcplayer.sound.OFF"

    private const val TAG = "SoundEffectsService"
  }
}
