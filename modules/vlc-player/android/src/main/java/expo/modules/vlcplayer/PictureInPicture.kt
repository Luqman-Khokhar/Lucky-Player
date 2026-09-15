package expo.modules.vlcplayer

import android.app.Activity
import android.app.AppOpsManager
import android.app.PendingIntent
import android.app.PictureInPictureParams
import android.app.RemoteAction
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.drawable.Icon
import android.net.Uri
import android.os.Build
import android.os.Process
import android.provider.Settings
import android.util.Log
import android.util.Rational

/**
 * Picture-in-picture for the app's single activity. The system owns the window: the app sets its aspect ratio and
 * the buttons shown when the user taps it (back, play/pause, forward). Taps on the video itself never reach the app.
 * Main thread only.
 */
object PictureInPicture {
  const val ACTION_CONTROL = "expo.modules.vlcplayer.PICTURE_IN_PICTURE_CONTROL"
  const val EXTRA_CONTROL = "control"

  const val CONTROL_REWIND = "rewind"
  const val CONTROL_TOGGLE = "toggle"
  const val CONTROL_FORWARD = "forward"

  private const val TAG = "PictureInPicture"

  // Android rejects aspect ratios beyond 2.39:1 in either direction.
  private const val MAX_RATIO = 2.38f
  private const val RATIO_PRECISION = 1000

  // Every params update replaces all fields, so the latest player values are kept here.
  private var width = 0
  private var height = 0
  private var autoEnter = false
  private var paused = false

  /** Skip step shown on the window buttons, kept in sync with the app setting. */
  var skipSeconds = 10
    private set

  fun isSupported(context: Context): Boolean =
    Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
      context.packageManager.hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE)

  /** False when picture-in-picture is turned off for this app in system settings. */
  fun isAllowed(context: Context): Boolean {
    if (!isSupported(context)) return false
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return true
    val appOps = context.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
    val mode = appOps.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_PICTURE_IN_PICTURE, Process.myUid(), context.packageName)
    return mode == AppOpsManager.MODE_ALLOWED
  }

  fun isActive(activity: Activity): Boolean =
    Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && activity.isInPictureInPictureMode

  /** True when leaving the app right now would open picture-in-picture instead of hiding the player. */
  fun isAutoEnterArmed(context: Context): Boolean =
    autoEnter && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && isAllowed(context)

  fun enter(activity: Activity, width: Int, height: Int): Boolean {
    if (!isAllowed(activity)) return false
    rememberSize(width, height)
    return try {
      activity.enterPictureInPictureMode(params(activity))
    } catch (e: IllegalStateException) {
      Log.w(TAG, "Could not enter picture-in-picture", e)
      false
    }
  }

  /** Android 12+: while enabled, leaving the app (home gesture) shrinks the video instead of pausing it. */
  fun setAutoEnter(activity: Activity, enabled: Boolean, width: Int, height: Int) {
    autoEnter = enabled
    rememberSize(width, height)
    apply(activity)
  }

  /** Keeps the play/pause button and skip labels in the picture-in-picture window current. */
  fun setPlayback(activity: Activity, paused: Boolean, skipSeconds: Int) {
    this.paused = paused
    this.skipSeconds = skipSeconds
    apply(activity)
  }

  fun openSettings(context: Context) {
    val packageUri = Uri.parse("package:${context.packageName}")
    val intents = listOf(
      Intent("android.settings.PICTURE_IN_PICTURE_SETTINGS", packageUri),
      Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, packageUri)
    )
    for (intent in intents) {
      try {
        context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        return
      } catch (_: ActivityNotFoundException) {
      }
    }
  }

  private fun rememberSize(width: Int, height: Int) {
    if (width <= 0 || height <= 0) return
    this.width = width
    this.height = height
  }

  private fun apply(activity: Activity) {
    if (!isSupported(activity)) return
    try {
      activity.setPictureInPictureParams(params(activity))
    } catch (e: IllegalStateException) {
      Log.w(TAG, "Could not update picture-in-picture params", e)
    }
  }

  private fun params(context: Context): PictureInPictureParams {
    val builder = PictureInPictureParams.Builder().setActions(actions(context))
    if (width > 0 && height > 0) {
      val ratio = (width.toFloat() / height).coerceIn(1 / MAX_RATIO, MAX_RATIO)
      builder.setAspectRatio(Rational((ratio * RATIO_PRECISION).toInt(), RATIO_PRECISION))
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) builder.setAutoEnterEnabled(autoEnter)
    return builder.build()
  }

  private fun actions(context: Context): List<RemoteAction> = listOf(
    action(context, CONTROL_REWIND, android.R.drawable.ic_media_rew, "Back $skipSeconds seconds"),
    if (paused) {
      action(context, CONTROL_TOGGLE, android.R.drawable.ic_media_play, "Play")
    } else {
      action(context, CONTROL_TOGGLE, android.R.drawable.ic_media_pause, "Pause")
    },
    action(context, CONTROL_FORWARD, android.R.drawable.ic_media_ff, "Forward $skipSeconds seconds")
  )

  private fun action(context: Context, control: String, icon: Int, title: String): RemoteAction {
    val intent = Intent(ACTION_CONTROL).setPackage(context.packageName).putExtra(EXTRA_CONTROL, control)
    val pending = PendingIntent.getBroadcast(
      context,
      control.hashCode(),
      intent,
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    )
    return RemoteAction(Icon.createWithResource("android", icon), title, title, pending)
  }
}
