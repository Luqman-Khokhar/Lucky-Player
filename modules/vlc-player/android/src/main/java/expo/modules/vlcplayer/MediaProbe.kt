package expo.modules.vlcplayer

import android.content.Context
import android.os.SystemClock
import android.util.Log
import org.videolan.libvlc.LibVLC
import org.videolan.libvlc.interfaces.IMedia
import java.io.IOException

/** Reads duration and track layout without starting playback. Blocking; call off the main thread. */
object MediaProbe {
  private const val TAG = "MediaProbe"

  fun probe(context: Context, uri: String): Map<String, Any> {
    val libVLC = VlcEngine.acquire(context)
    return try {
      probeWith(context, libVLC, uri)
    } finally {
      VlcEngine.release(libVLC)
    }
  }

  private fun probeWith(context: Context, libVLC: LibVLC, uri: String): Map<String, Any> {
    val startedAt = SystemClock.elapsedRealtime()
    val opened = VlcEngine.openMedia(context, libVLC, uri)
    try {
      val media = opened.media
      media.parse()
      Log.i(TAG, "probe took ${SystemClock.elapsedRealtime() - startedAt} ms")
      val video = mutableListOf<Map<String, Any>>()
      val audio = mutableListOf<Map<String, Any>>()
      val subtitle = mutableListOf<Map<String, Any>>()
      for (index in 0 until media.trackCount) {
        when (val track = media.getTrack(index)) {
          is IMedia.VideoTrack -> video += mapOf(
            "id" to track.id,
            "codec" to track.codec.orEmpty(),
            "width" to track.width,
            "height" to track.height,
            "fps" to if (track.frameRateDen > 0) track.frameRateNum.toDouble() / track.frameRateDen else 0.0,
            "bitrate" to track.bitrate
          )
          is IMedia.AudioTrack -> audio += mapOf(
            "id" to track.id,
            "codec" to track.codec.orEmpty(),
            "language" to track.language.orEmpty(),
            "description" to track.description.orEmpty(),
            "channels" to track.channels,
            "sampleRate" to track.rate
          )
          null -> Unit
          else -> subtitle += mapOf(
            "id" to track.id,
            "codec" to track.codec.orEmpty(),
            "language" to track.language.orEmpty(),
            "description" to track.description.orEmpty()
          )
        }
      }
      return mapOf(
        "duration" to media.duration,
        "video" to video,
        "audio" to audio,
        "subtitle" to subtitle
      )
    } finally {
      opened.media.release()
      try {
        opened.descriptor?.close()
      } catch (_: IOException) {
      }
    }
  }
}
