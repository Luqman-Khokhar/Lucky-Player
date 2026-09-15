package expo.modules.vlcplayer

import android.app.Activity
import android.app.Application
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.AudioManager
import android.os.Build
import android.os.Bundle

/**
 * Watches the player's activity and the device for moments playback must react to: the activity stopping, the
 * screen turning off, headphones disconnecting, and picture-in-picture window buttons. Main thread only.
 */
internal class PlaybackHost(private val activity: Activity, private val listener: Listener) {
  interface Listener {
    /** The activity stopped: home, another app, or screen off. Picture-in-picture does not stop it. */
    fun onHostHidden()
    fun onHostShown()
    /** Wired or Bluetooth headphones disconnected, or the screen turned off. */
    fun onAudioMustStop()
    fun onPictureInPictureControl(control: String)
  }

  private var started = false

  private val lifecycle = object : Application.ActivityLifecycleCallbacks {
    override fun onActivityStarted(startedActivity: Activity) {
      if (startedActivity === activity) listener.onHostShown()
    }

    override fun onActivityStopped(stoppedActivity: Activity) {
      if (stoppedActivity === activity) listener.onHostHidden()
    }

    override fun onActivityCreated(createdActivity: Activity, savedInstanceState: Bundle?) = Unit
    override fun onActivityResumed(resumedActivity: Activity) = Unit
    override fun onActivityPaused(pausedActivity: Activity) = Unit
    override fun onActivitySaveInstanceState(savedActivity: Activity, outState: Bundle) = Unit
    override fun onActivityDestroyed(destroyedActivity: Activity) = Unit
  }

  private val receiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context?, intent: Intent?) {
      when (intent?.action) {
        Intent.ACTION_SCREEN_OFF, AudioManager.ACTION_AUDIO_BECOMING_NOISY -> listener.onAudioMustStop()
        PictureInPicture.ACTION_CONTROL ->
          intent.getStringExtra(PictureInPicture.EXTRA_CONTROL)?.let { listener.onPictureInPictureControl(it) }
      }
    }
  }

  fun start() {
    if (started) return
    started = true
    activity.application.registerActivityLifecycleCallbacks(lifecycle)
    val filter = IntentFilter().apply {
      addAction(PictureInPicture.ACTION_CONTROL)
      addAction(Intent.ACTION_SCREEN_OFF)
      addAction(AudioManager.ACTION_AUDIO_BECOMING_NOISY)
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      activity.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
    } else {
      @Suppress("UnspecifiedRegisterReceiverFlag")
      activity.registerReceiver(receiver, filter)
    }
  }

  fun stop() {
    if (!started) return
    started = false
    activity.application.unregisterActivityLifecycleCallbacks(lifecycle)
    try {
      activity.unregisterReceiver(receiver)
    } catch (_: IllegalArgumentException) {
    }
  }
}
