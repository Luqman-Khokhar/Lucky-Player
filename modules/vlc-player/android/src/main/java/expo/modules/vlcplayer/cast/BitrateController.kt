package expo.modules.vlcplayer.cast

import android.os.SystemClock

/**
 * Keeps the encoder's bitrate in step with what the network manages. The laptop reports how far ahead it has
 * buffered: shrinking means the stream is arriving too slowly, a healthy lead means there is room to improve again.
 *
 * Changes are spaced out so the picture does not swing on a brief hiccup.
 */
internal class BitrateController(private val startBitrate: Int, private val targetAheadMs: Long) {
  private val minBitrate = (startBitrate / 4).coerceAtLeast(MIN_BITRATE)
  private var current = startBitrate
  private var lastChangeAt = 0L
  private var lowReadings = 0

  /** The bitrate to apply now, or null to keep the current one. */
  fun update(bufferedAheadMs: Long): Int? {
    val now = SystemClock.elapsedRealtime()
    if (lastChangeAt == 0L) lastChangeAt = now
    // One brief dip is a hiccup, not a slow network; two in a row is worth acting on.
    lowReadings = if (bufferedAheadMs < targetAheadMs / 2) lowReadings + 1 else 0
    if (now - lastChangeAt < HOLD_MS) return null
    val next = when {
      lowReadings >= LOW_READINGS_BEFORE_DROP -> current * 2 / 3
      bufferedAheadMs > targetAheadMs * 2 -> current * 4 / 3
      else -> current
    }.coerceIn(minBitrate, startBitrate)
    if (next < current) lowReadings = 0
    if (next == current) return null
    current = next
    lastChangeAt = now
    return next
  }

  companion object {
    private const val HOLD_MS = 4_000L
    private const val LOW_READINGS_BEFORE_DROP = 2
    private const val MIN_BITRATE = 800_000
  }
}
