package expo.modules.vlcplayer

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Build
import android.os.Handler
import android.os.Looper

/**
 * Audio focus for video playback. Calls, alarms and assistants report a transient loss; another app starting media
 * reports a permanent loss; navigation prompts are ducked by the system itself (Android 8+). Main thread only.
 */
internal class PlaybackAudioFocus(context: Context, private val onChange: (Change) -> Unit) {
  enum class Change { LOSS, LOSS_TRANSIENT, GAIN }

  private val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
  private var held = false

  private val listener = AudioManager.OnAudioFocusChangeListener { focusChange ->
    when (focusChange) {
      AudioManager.AUDIOFOCUS_GAIN -> onChange(Change.GAIN)
      AudioManager.AUDIOFOCUS_LOSS -> {
        held = false
        onChange(Change.LOSS)
      }
      AudioManager.AUDIOFOCUS_LOSS_TRANSIENT -> onChange(Change.LOSS_TRANSIENT)
    }
  }

  private val request: AudioFocusRequest? =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
        .setAudioAttributes(
          AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_MEDIA)
            .setContentType(AudioAttributes.CONTENT_TYPE_MOVIE)
            .build()
        )
        .setWillPauseWhenDucked(false)
        .setOnAudioFocusChangeListener(listener, Handler(Looper.getMainLooper()))
        .build()
    } else {
      null
    }

  /** True when playback may start; false during a phone call or while another app refuses to yield. */
  fun request(): Boolean {
    if (held) return true
    val result = request?.let { audioManager.requestAudioFocus(it) } ?: requestLegacy()
    held = result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
    return held
  }

  fun abandon() {
    if (!held) return
    held = false
    request?.let { audioManager.abandonAudioFocusRequest(it) } ?: abandonLegacy()
  }

  @Suppress("DEPRECATION")
  private fun requestLegacy(): Int =
    audioManager.requestAudioFocus(listener, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN)

  @Suppress("DEPRECATION")
  private fun abandonLegacy() {
    audioManager.abandonAudioFocus(listener)
  }
}
