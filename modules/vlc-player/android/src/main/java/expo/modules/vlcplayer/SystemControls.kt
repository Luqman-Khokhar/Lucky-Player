package expo.modules.vlcplayer

import android.app.Activity
import android.content.Context
import android.media.AudioManager
import android.provider.Settings
import android.view.WindowManager

/** Window brightness and media volume, driven by the player's swipe gestures. */
object SystemControls {
  private const val STREAM = AudioManager.STREAM_MUSIC
  private const val SYSTEM_BRIGHTNESS_MAX = 255.0
  private const val MIN_WINDOW_BRIGHTNESS = 0.01f

  /** 0..1. When the window follows the system setting, reports the system brightness instead. */
  fun getBrightness(activity: Activity): Double {
    val window = activity.window.attributes.screenBrightness
    if (window >= 0f) return window.toDouble()
    val system = Settings.System.getInt(activity.contentResolver, Settings.System.SCREEN_BRIGHTNESS, 128)
    return (system / SYSTEM_BRIGHTNESS_MAX).coerceIn(0.0, 1.0)
  }

  /** Affects this window only. A negative value hands control back to the system setting. */
  fun setBrightness(activity: Activity, value: Double) {
    activity.runOnUiThread {
      val attributes = activity.window.attributes
      attributes.screenBrightness =
        if (value < 0) WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE
        else value.toFloat().coerceIn(MIN_WINDOW_BRIGHTNESS, 1f)
      activity.window.attributes = attributes
    }
  }

  fun getVolume(context: Context): Map<String, Int> {
    val audio = audioManager(context)
    return mapOf("current" to audio.getStreamVolume(STREAM), "max" to audio.getStreamMaxVolume(STREAM))
  }

  /** Sets the media stream index without showing the system volume panel. */
  fun setVolume(context: Context, index: Int) {
    val audio = audioManager(context)
    try {
      audio.setStreamVolume(STREAM, index.coerceIn(0, audio.getStreamMaxVolume(STREAM)), 0)
    } catch (_: SecurityException) {
      // Do Not Disturb can block volume changes.
    }
  }

  private fun audioManager(context: Context) = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
}
