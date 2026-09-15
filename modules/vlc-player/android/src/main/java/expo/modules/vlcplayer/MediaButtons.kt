package expo.modules.vlcplayer

import android.content.Context
import android.content.Intent
import android.media.session.MediaSession
import android.media.session.PlaybackState
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.view.KeyEvent

/**
 * Headset, Bluetooth and car buttons through a platform media session. The session is active only while the player
 * is visible (full screen or picture-in-picture), so a button can never start playback in the background.
 *
 * Play/pause keys toggle; next, previous, fast-forward and rewind keys skip. A single-button wired headset toggles
 * on one press, skips forward on two presses and back on three. Main thread only.
 */
internal class MediaButtons(context: Context, private val onControl: (String) -> Unit) {
  private val handler = Handler(Looper.getMainLooper())
  private val session = MediaSession(context, SESSION_TAG)
  private var active = false
  private var playing = false
  private var headsetPresses = 0

  private val flushHeadsetPresses = Runnable {
    val presses = headsetPresses
    headsetPresses = 0
    when {
      presses == 1 -> onControl(PlaybackControls.TOGGLE)
      presses == 2 -> onControl(PlaybackControls.FORWARD)
      presses >= 3 -> onControl(PlaybackControls.REWIND)
    }
  }

  private val callback = object : MediaSession.Callback() {
    override fun onMediaButtonEvent(mediaButtonIntent: Intent): Boolean {
      val event = keyEventOf(mediaButtonIntent) ?: return false
      val control = when (event.keyCode) {
        KeyEvent.KEYCODE_HEADSETHOOK -> HEADSET_BUTTON
        KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE -> PlaybackControls.TOGGLE
        KeyEvent.KEYCODE_MEDIA_PLAY -> PlaybackControls.PLAY
        KeyEvent.KEYCODE_MEDIA_PAUSE -> PlaybackControls.PAUSE
        KeyEvent.KEYCODE_MEDIA_NEXT, KeyEvent.KEYCODE_MEDIA_FAST_FORWARD -> PlaybackControls.FORWARD
        KeyEvent.KEYCODE_MEDIA_PREVIOUS, KeyEvent.KEYCODE_MEDIA_REWIND -> PlaybackControls.REWIND
        else -> return super.onMediaButtonEvent(mediaButtonIntent)
      }
      // One action per press: key-up and auto-repeat from a held button are consumed without acting.
      if (!active || event.action != KeyEvent.ACTION_DOWN || event.repeatCount > 0) return true
      if (control == HEADSET_BUTTON) {
        headsetPresses++
        handler.removeCallbacks(flushHeadsetPresses)
        handler.postDelayed(flushHeadsetPresses, MULTI_PRESS_WINDOW_MS)
      } else {
        onControl(control)
      }
      return true
    }

    // Controllers that send transport commands instead of key events, such as watches and some car systems.
    override fun onPlay() = controlIfActive(PlaybackControls.PLAY)
    override fun onPause() = controlIfActive(PlaybackControls.PAUSE)
    override fun onSkipToNext() = controlIfActive(PlaybackControls.FORWARD)
    override fun onSkipToPrevious() = controlIfActive(PlaybackControls.REWIND)
    override fun onFastForward() = controlIfActive(PlaybackControls.FORWARD)
    override fun onRewind() = controlIfActive(PlaybackControls.REWIND)
  }

  init {
    session.setCallback(callback, handler)
    publishState()
  }

  fun setActive(value: Boolean) {
    if (value == active) return
    active = value
    if (!value) {
      handler.removeCallbacks(flushHeadsetPresses)
      headsetPresses = 0
    }
    session.isActive = value
  }

  fun setPlaying(value: Boolean) {
    if (value == playing) return
    playing = value
    publishState()
  }

  fun release() {
    setActive(false)
    session.release()
  }

  private fun controlIfActive(control: String) {
    if (active) onControl(control)
  }

  private fun publishState() {
    val state = if (playing) PlaybackState.STATE_PLAYING else PlaybackState.STATE_PAUSED
    session.setPlaybackState(
      PlaybackState.Builder()
        .setActions(SUPPORTED_ACTIONS)
        .setState(state, PlaybackState.PLAYBACK_POSITION_UNKNOWN, if (playing) 1f else 0f)
        .build()
    )
  }

  @Suppress("DEPRECATION")
  private fun keyEventOf(intent: Intent): KeyEvent? =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      intent.getParcelableExtra(Intent.EXTRA_KEY_EVENT, KeyEvent::class.java)
    } else {
      intent.getParcelableExtra(Intent.EXTRA_KEY_EVENT)
    }

  companion object {
    private const val SESSION_TAG = "LuckyPlayer"
    private const val HEADSET_BUTTON = "headset"

    // Longest gap between presses that still counts as a double or triple press.
    private const val MULTI_PRESS_WINDOW_MS = 400L

    private val SUPPORTED_ACTIONS = PlaybackState.ACTION_PLAY or
      PlaybackState.ACTION_PAUSE or
      PlaybackState.ACTION_PLAY_PAUSE or
      PlaybackState.ACTION_SKIP_TO_NEXT or
      PlaybackState.ACTION_SKIP_TO_PREVIOUS or
      PlaybackState.ACTION_FAST_FORWARD or
      PlaybackState.ACTION_REWIND
  }
}
