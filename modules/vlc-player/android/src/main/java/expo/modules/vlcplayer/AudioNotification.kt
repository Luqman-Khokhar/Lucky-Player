package expo.modules.vlcplayer

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build

/** The media notification: album art, title, artist and the transport controls the lock screen mirrors. */
internal object AudioNotification {
  const val ID = 7402

  private const val CHANNEL_ID = "audio_playback"
  private const val MUSIC_PAGE_URI = "player://now-playing"

  fun build(context: Context): Notification {
    ensureChannel(context)
    val item = AudioPlayback.current
    val playing = AudioPlayback.isPlaying

    val builder = builder(context)
      .setSmallIcon(R.drawable.ic_stat_sound)
      .setContentTitle(item?.title ?: context.getString(R.string.audio_notification_title))
      .setContentText(item?.artist?.ifEmpty { null } ?: context.getString(R.string.audio_unknown_artist))
      .setSubText(item?.album?.ifEmpty { null })
      .setLargeIcon(AudioPlayback.artwork())
      .setContentIntent(openNowPlaying(context))
      .setDeleteIntent(serviceAction(context, AudioPlaybackService.ACTION_STOP, 14))
      .setCategory(Notification.CATEGORY_TRANSPORT)
      .setVisibility(Notification.VISIBILITY_PUBLIC)
      .setOngoing(playing)
      .setOnlyAlertOnce(true)
      .setShowWhen(false)

    builder.addAction(
      action(context, R.drawable.ic_media_previous, R.string.audio_previous, AudioPlaybackService.ACTION_PREVIOUS, 11)
    )
    builder.addAction(
      if (playing) {
        action(context, R.drawable.ic_media_pause, R.string.audio_pause, AudioPlaybackService.ACTION_PAUSE, 12)
      } else {
        action(context, R.drawable.ic_media_play, R.string.audio_play, AudioPlaybackService.ACTION_PLAY, 12)
      }
    )
    builder.addAction(
      action(context, R.drawable.ic_media_next, R.string.audio_next, AudioPlaybackService.ACTION_NEXT, 13)
    )

    val style = Notification.MediaStyle().setShowActionsInCompactView(0, 1, 2)
    AudioPlayback.sessionToken?.let { style.setMediaSession(it) }
    builder.setStyle(style)
    return builder.build()
  }

  private fun action(context: Context, icon: Int, label: Int, intentAction: String, requestCode: Int): Notification.Action =
    Notification.Action.Builder(
      android.graphics.drawable.Icon.createWithResource(context, icon),
      context.getString(label),
      serviceAction(context, intentAction, requestCode)
    ).build()

  @Suppress("DEPRECATION")
  private fun builder(context: Context): Notification.Builder =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(context, CHANNEL_ID)
    } else {
      Notification.Builder(context)
    }

  private fun serviceAction(context: Context, action: String, requestCode: Int): PendingIntent {
    val intent = Intent(context, AudioPlaybackService::class.java).setAction(action)
    val flags = PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      PendingIntent.getForegroundService(context, requestCode, intent, flags)
    } else {
      PendingIntent.getService(context, requestCode, intent, flags)
    }
  }

  private fun openNowPlaying(context: Context): PendingIntent {
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(MUSIC_PAGE_URI))
      .setPackage(context.packageName)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    return PendingIntent.getActivity(
      context,
      10,
      intent,
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    )
  }

  private fun ensureChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(NotificationManager::class.java)
    if (manager.getNotificationChannel(CHANNEL_ID) != null) return
    val channel = NotificationChannel(
      CHANNEL_ID,
      context.getString(R.string.audio_notification_channel),
      NotificationManager.IMPORTANCE_LOW
    ).apply {
      description = context.getString(R.string.audio_notification_channel_description)
      setShowBadge(false)
    }
    manager.createNotificationChannel(channel)
  }
}
