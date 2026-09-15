package expo.modules.vlcplayer

import android.app.Activity
import android.util.Log
import kotlin.math.abs
import kotlin.math.roundToInt

/**
 * Asks for a display refresh rate that is a whole multiple of the video frame rate, so every frame stays on
 * screen equally long: 24 fps runs at 120 Hz, 30 and 60 fps at 60 Hz. Rates with no multiple (25 fps on a
 * 60/90/120 Hz panel) keep the system default. Main thread only.
 */
object FrameRateMatcher {
  private const val TAG = "FrameRateMatcher"

  // 23.976 fps on 120 Hz is a 5.005 ratio.
  private const val MULTIPLE_TOLERANCE = 0.02

  /** True when a display mode was requested; call [reset] when playback ends. */
  fun apply(activity: Activity, fps: Double): Boolean {
    if (fps <= 0) return false
    val display = activity.window.decorView.display ?: return false
    val current = display.mode
    val best = display.supportedModes
      .filter { it.physicalWidth == current.physicalWidth && it.physicalHeight == current.physicalHeight }
      .filter { isWholeMultiple(it.refreshRate.toDouble(), fps) }
      .minByOrNull { it.refreshRate } ?: return false
    val attributes = activity.window.attributes
    attributes.preferredDisplayModeId = best.modeId
    activity.window.attributes = attributes
    Log.i(TAG, "Video at $fps fps, display at ${best.refreshRate} Hz")
    return true
  }

  fun reset(activity: Activity) {
    activity.runOnUiThread {
      val attributes = activity.window.attributes
      attributes.preferredDisplayModeId = 0
      activity.window.attributes = attributes
    }
  }

  private fun isWholeMultiple(rate: Double, fps: Double): Boolean {
    val ratio = rate / fps
    val whole = ratio.roundToInt()
    return whole >= 1 && abs(ratio - whole) <= MULTIPLE_TOLERANCE
  }
}
