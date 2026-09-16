package expo.modules.vlcplayer.cast

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.drawable.Icon
import android.net.Uri
import android.os.Build
import expo.modules.vlcplayer.R

/** Quiet ongoing notification while casting: laptop count, the address and code to connect, and Stop. */
internal object CastNotification {
  const val ID = 7402

  private const val CHANNEL_ID = "cast"
  private const val CAST_PAGE_URI = "player://cast"

  fun build(context: Context, state: Map<String, Any?>): Notification {
    ensureChannel(context)
    val address = state["address"] as? String
    val code = state["code"] as? String
    val laptops = (state["receivers"] as? List<*>)?.size ?: 0
    val title = if (laptops > 0) {
      context.resources.getQuantityString(R.plurals.cast_notification_connected, laptops, laptops)
    } else {
      context.getString(R.string.cast_notification_waiting)
    }
    val text = if (address != null && code != null) {
      context.getString(R.string.cast_notification_address, address, code)
    } else {
      context.getString(R.string.cast_notification_no_network)
    }
    val stop = Notification.Action.Builder(
      Icon.createWithResource(context, R.drawable.ic_stat_cast),
      context.getString(R.string.cast_stop),
      stopIntent(context)
    ).build()
    return builder(context)
      .setSmallIcon(R.drawable.ic_stat_cast)
      .setColor(context.getColor(R.color.sound_notification_accent))
      .setContentTitle(title)
      .setContentText(text)
      .setStyle(Notification.BigTextStyle().bigText(text))
      .setContentIntent(openCastPage(context))
      .addAction(stop)
      .setCategory(Notification.CATEGORY_SERVICE)
      .setVisibility(Notification.VISIBILITY_PUBLIC)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setShowWhen(false)
      .build()
  }

  fun update(context: Context, state: Map<String, Any?>) {
    context.getSystemService(NotificationManager::class.java)?.notify(ID, build(context, state))
  }

  @Suppress("DEPRECATION")
  private fun builder(context: Context): Notification.Builder =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) Notification.Builder(context, CHANNEL_ID) else Notification.Builder(context)

  // The service is already in the foreground, so a plain service intent is allowed to reach it.
  private fun stopIntent(context: Context): PendingIntent {
    val intent = Intent(context, CastService::class.java).setAction(CastService.ACTION_STOP)
    return PendingIntent.getService(context, 0, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
  }

  private fun openCastPage(context: Context): PendingIntent {
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(CAST_PAGE_URI))
      .setPackage(context.packageName)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    return PendingIntent.getActivity(context, 1, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
  }

  private fun ensureChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(NotificationManager::class.java)
    if (manager.getNotificationChannel(CHANNEL_ID) != null) return
    val channel = NotificationChannel(
      CHANNEL_ID,
      context.getString(R.string.cast_notification_channel),
      NotificationManager.IMPORTANCE_LOW
    ).apply {
      description = context.getString(R.string.cast_notification_channel_description)
      setShowBadge(false)
    }
    manager.createNotificationChannel(channel)
  }
}
