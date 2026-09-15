package expo.modules.vlcplayer

/** Control names shared by picture-in-picture buttons, media buttons and the JS onPlaybackControl event. */
object PlaybackControls {
  const val TOGGLE = "toggle"
  const val PLAY = "play"
  const val PAUSE = "pause"
  const val REWIND = "rewind"
  const val FORWARD = "forward"

  /** Play was refused because another app holds audio focus, such as a phone call. */
  const val BLOCKED = "blocked"
}
