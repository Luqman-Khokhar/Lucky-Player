package expo.modules.vlcplayer

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.view.View
import android.widget.RemoteViews

/**
 * The quiet, ongoing sound notification. Collapsed: boost −/value/+, preset name, next preset, turn off. Expanded:
 * a boost section with a level bar, an equalizer section with previous/next preset, and a turn-off button; tapping a
 * section header turns that effect on or off.
 */
internal object SoundNotification {
  const val ID = 7401

  private const val CHANNEL_ID = "sound_effects"
  private const val SOUND_PAGE_URI = "player://sound"
  private const val MAX_BOOST_PERCENT = 100
  private const val DIMMED_ALPHA = 0.38f

  fun build(context: Context, snapshot: SoundEffectsController.Snapshot?, summary: String): Notification {
    ensureChannel(context)
    val collapsed = RemoteViews(context.packageName, R.layout.notification_sound_collapsed)
    val expanded = RemoteViews(context.packageName, R.layout.notification_sound_expanded)
    if (snapshot != null) {
      bindShared(context, collapsed, snapshot)
      bindShared(context, expanded, snapshot)
      bindExpanded(context, expanded, snapshot)
    }
    return builder(context)
      .setSmallIcon(R.drawable.ic_stat_sound)
      .setColor(context.getColor(R.color.sound_notification_accent))
      .setContentTitle(context.getString(R.string.sound_notification_title))
      .setContentText(summary)
      .setCustomContentView(collapsed)
      .setCustomBigContentView(expanded)
      .setStyle(Notification.DecoratedCustomViewStyle())
      .setContentIntent(openSoundPage(context))
      .setCategory(Notification.CATEGORY_SERVICE)
      .setVisibility(Notification.VISIBILITY_PUBLIC)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setShowWhen(false)
      .build()
  }

  /** Views present in both layouts. */
  private fun bindShared(context: Context, views: RemoteViews, snapshot: SoundEffectsController.Snapshot) {
    views.setTextViewText(R.id.boost_value, boostText(context, snapshot))
    views.setTextViewText(R.id.preset_label, presetText(context, snapshot))
    views.setOnClickPendingIntent(R.id.boost_down, serviceAction(context, SoundEffectsService.ACTION_BOOST_DOWN, 1))
    views.setOnClickPendingIntent(R.id.boost_up, serviceAction(context, SoundEffectsService.ACTION_BOOST_UP, 2))
    views.setOnClickPendingIntent(R.id.preset_next, serviceAction(context, SoundEffectsService.ACTION_NEXT_PRESET, 3))
    views.setOnClickPendingIntent(R.id.turn_off, serviceAction(context, SoundEffectsService.ACTION_OFF, 4))
    // Dim buttons that would do nothing right now.
    dim(views, R.id.boost_down, snapshot.boostEnabled && snapshot.boostPercent > 0)
    dim(views, R.id.boost_up, !snapshot.boostEnabled || snapshot.boostPercent < snapshot.boostLimit)
    dim(views, R.id.preset_next, snapshot.equalizerAvailable)
  }

  private fun bindExpanded(context: Context, views: RemoteViews, snapshot: SoundEffectsController.Snapshot) {
    views.setOnClickPendingIntent(R.id.boost_header, serviceAction(context, SoundEffectsService.ACTION_TOGGLE_BOOST, 5))
    views.setOnClickPendingIntent(
      R.id.equalizer_header,
      serviceAction(context, SoundEffectsService.ACTION_TOGGLE_EQUALIZER, 6)
    )
    views.setOnClickPendingIntent(
      R.id.preset_previous,
      serviceAction(context, SoundEffectsService.ACTION_PREVIOUS_PRESET, 7)
    )
    dim(views, R.id.preset_previous, snapshot.equalizerAvailable)

    val level = if (snapshot.boostEnabled) snapshot.boostPercent else 0
    views.setProgressBar(R.id.boost_level, MAX_BOOST_PERCENT, level, false)

    val atLimit = snapshot.boostEnabled && snapshot.boostLimit < MAX_BOOST_PERCENT && snapshot.boostPercent >= snapshot.boostLimit
    views.setViewVisibility(R.id.boost_hint, if (atLimit) View.VISIBLE else View.GONE)
    if (atLimit) views.setTextViewText(R.id.boost_hint, context.getString(R.string.sound_boost_limit_hint, snapshot.boostLimit))

    val position = when {
      !snapshot.equalizerAvailable -> ""
      !snapshot.equalizerEnabled -> context.getString(R.string.sound_equalizer_off_hint)
      snapshot.presetIndex < 0 -> context.getString(R.string.sound_custom_position)
      else -> context.getString(R.string.sound_preset_position, snapshot.presetIndex + 1, snapshot.presetCount)
    }
    views.setTextViewText(R.id.preset_position, position)
  }

  private fun boostText(context: Context, snapshot: SoundEffectsController.Snapshot): String =
    if (snapshot.boostEnabled) "+${snapshot.boostPercent}%" else context.getString(R.string.sound_off_state)

  private fun presetText(context: Context, snapshot: SoundEffectsController.Snapshot): String = when {
    !snapshot.equalizerEnabled -> context.getString(R.string.sound_off_state)
    !snapshot.equalizerAvailable -> context.getString(R.string.sound_equalizer_unavailable)
    else -> snapshot.presetLabel ?: context.getString(R.string.sound_custom_preset)
  }

  private fun dim(views: RemoteViews, viewId: Int, enabled: Boolean) {
    views.setFloat(viewId, "setAlpha", if (enabled) 1f else DIMMED_ALPHA)
  }

  @Suppress("DEPRECATION")
  private fun builder(context: Context): Notification.Builder =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) Notification.Builder(context, CHANNEL_ID) else Notification.Builder(context)

  private fun serviceAction(context: Context, action: String, requestCode: Int): PendingIntent {
    val intent = Intent(context, SoundEffectsService::class.java).setAction(action)
    val flags = PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      PendingIntent.getForegroundService(context, requestCode, intent, flags)
    } else {
      PendingIntent.getService(context, requestCode, intent, flags)
    }
  }

  private fun openSoundPage(context: Context): PendingIntent {
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(SOUND_PAGE_URI))
      .setPackage(context.packageName)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    return PendingIntent.getActivity(context, 0, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
  }

  private fun ensureChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(NotificationManager::class.java)
    if (manager.getNotificationChannel(CHANNEL_ID) != null) return
    val channel = NotificationChannel(
      CHANNEL_ID,
      context.getString(R.string.sound_notification_channel),
      NotificationManager.IMPORTANCE_LOW
    ).apply {
      description = context.getString(R.string.sound_notification_channel_description)
      setShowBadge(false)
    }
    manager.createNotificationChannel(channel)
  }
}
