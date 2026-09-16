package expo.modules.vlcplayer.cast

import android.content.Context
import android.media.MediaCodecList
import android.media.MediaExtractor
import android.media.MediaFormat
import android.net.Uri
import android.util.Log
import expo.modules.vlcplayer.VlcEngine
import org.json.JSONObject
import java.io.IOException

/**
 * Decides whether a laptop browser can play a file as it is: the file's container and first video and audio tracks
 * against what the receiver page reported with canPlayType. MKV and WebM tracks come from the file header
 * ([MatroskaTracks]); other files use Android's MediaExtractor. Track codecs are expressed as MediaFormat MIME types.
 */
internal object CodecPlanner {
  private const val TAG = "CodecPlanner"

  class Tracks(val video: String?, val audio: String?)

  enum class Mode {
    /** The file is served as it is. */
    DIRECT,
    /** The phone re-encodes it to H.264 and AAC while casting. */
    CONVERT,
    /** Neither works; [Plan.blocker] says what stops it. */
    REFUSE
  }

  class Plan(val mode: Mode, /** What the browser can't play, e.g. "HEVC video in MKV"; empty when direct. */ val blocker: String)

  private enum class Container(val label: String) { MP4("MP4"), WEBM("WebM"), MKV("MKV") }

  /** The first video and audio track, or null when the file could not be parsed. Blocking. */
  fun readTracks(context: Context, media: CastMedia): Tracks? =
    try {
      when (containerOf(media.mimeType)) {
        Container.MKV, Container.WEBM -> media.open(context, 0L).use { stream ->
          MatroskaTracks.read(stream.channel)?.let { tracks ->
            Tracks(
              video = tracks.firstOrNull { it.type == MatroskaTracks.TYPE_VIDEO }?.let { matroskaVideoMime(it.codecId) },
              audio = tracks.firstOrNull { it.type == MatroskaTracks.TYPE_AUDIO }?.let { matroskaAudioMime(it.codecId) }
            )
          }
        }
        else -> extractorTracks(context, media.uri)
      }
    } catch (e: IOException) {
      Log.w(TAG, "Cannot read tracks of ${media.uri}", e)
      null
    } catch (e: RuntimeException) {
      // IllegalArgumentException for unparsable files, SecurityException without read access.
      Log.w(TAG, "Cannot read tracks of ${media.uri}", e)
      null
    }

  /** [blocked] holds codecs this laptop claimed it could play but then failed to decode. */
  fun plan(media: CastMedia, tracks: Tracks?, capabilities: JSONObject, blocked: Set<String>): Plan {
    val direct = capabilities.optJSONObject("direct") ?: JSONObject()
    val container = containerOf(media.mimeType)
    // Unknown tracks could mean a video that plays without sound, so it is never sent as it is.
    if (tracks == null || (tracks.video == null && tracks.audio == null)) {
      return Plan(Mode.REFUSE, "this video's format")
    }
    val alreadyFailed = tracks.video in blocked || tracks.audio in blocked
    if (!alreadyFailed && container != null && playsAsIs(container, tracks, direct)) return Plan(Mode.DIRECT, "")

    // Converting needs the phone to decode what it is given, and a browser plays the H.264 and AAC that come out.
    val video = tracks.video
    if (video == null || !canDecode(video)) {
      return Plan(Mode.REFUSE, "${codecName(video ?: "")} video".trim())
    }
    val audio = tracks.audio
    if (audio != null && !canDecode(audio)) return Plan(Mode.REFUSE, "${codecName(audio)} audio")
    return Plan(Mode.CONVERT, "")
  }

  private fun playsAsIs(container: Container, tracks: Tracks, direct: JSONObject): Boolean {
    val video = tracks.video
    if (video != null) {
      val key = videoKey(container, video) ?: return false
      if (!supported(direct, key)) return false
    }
    val audio = tracks.audio
    if (audio != null) {
      val key = audioKey(audio) ?: return false
      if (!supported(direct, key)) return false
    }
    return true
  }

  /** Whether this phone has a decoder for the codec; Dolby and DTS audio are missing on most phones. */
  private fun canDecode(mime: String): Boolean {
    if (mime.startsWith(MATROSKA_PREFIX)) return false
    return try {
      MediaCodecList(MediaCodecList.REGULAR_CODECS).codecInfos.any { info ->
        !info.isEncoder && info.supportedTypes.any { it.equals(mime, ignoreCase = true) }
      }
    } catch (e: RuntimeException) {
      Log.w(TAG, "Could not list decoders", e)
      false
    }
  }

  private fun extractorTracks(context: Context, uri: String): Tracks? {
    val extractor = MediaExtractor()
    try {
      val parsed = Uri.parse(uri)
      if (parsed.scheme.equals("content", ignoreCase = true)) {
        val descriptor = VlcEngine.openContentDescriptor(context, parsed) ?: return null
        descriptor.use { extractor.setDataSource(it.fileDescriptor) }
      } else {
        extractor.setDataSource(parsed.path ?: uri)
      }
      var video: String? = null
      var audio: String? = null
      for (index in 0 until extractor.trackCount) {
        val mime = extractor.getTrackFormat(index).getString(MediaFormat.KEY_MIME)?.lowercase() ?: continue
        if (video == null && mime.startsWith("video/")) video = mime
        if (audio == null && mime.startsWith("audio/")) audio = mime
      }
      return Tracks(video, audio)
    } finally {
      extractor.release()
    }
  }

  private fun matroskaVideoMime(codecId: String) = when {
    codecId.startsWith("V_MPEG4/ISO/AVC") -> MediaFormat.MIMETYPE_VIDEO_AVC
    codecId.startsWith("V_MPEGH/ISO/HEVC") -> MediaFormat.MIMETYPE_VIDEO_HEVC
    codecId == "V_VP9" -> MediaFormat.MIMETYPE_VIDEO_VP9
    codecId == "V_VP8" -> MediaFormat.MIMETYPE_VIDEO_VP8
    codecId == "V_AV1" -> MediaFormat.MIMETYPE_VIDEO_AV1
    codecId.startsWith("V_MPEG4/ISO/") -> MediaFormat.MIMETYPE_VIDEO_MPEG4
    codecId == "V_MPEG2" -> MediaFormat.MIMETYPE_VIDEO_MPEG2
    else -> "$MATROSKA_PREFIX$codecId"
  }

  private fun matroskaAudioMime(codecId: String) = when {
    codecId.startsWith("A_AAC") -> MediaFormat.MIMETYPE_AUDIO_AAC
    codecId == "A_MPEG/L3" -> MediaFormat.MIMETYPE_AUDIO_MPEG
    codecId == "A_OPUS" -> MediaFormat.MIMETYPE_AUDIO_OPUS
    codecId == "A_VORBIS" -> MediaFormat.MIMETYPE_AUDIO_VORBIS
    codecId == "A_FLAC" -> MediaFormat.MIMETYPE_AUDIO_FLAC
    codecId == "A_AC3" -> MediaFormat.MIMETYPE_AUDIO_AC3
    codecId == "A_EAC3" -> MediaFormat.MIMETYPE_AUDIO_EAC3
    codecId.startsWith("A_DTS") -> "audio/vnd.dts"
    codecId == "A_TRUEHD" -> "audio/true-hd"
    codecId.startsWith("A_PCM") -> MediaFormat.MIMETYPE_AUDIO_RAW
    else -> "$MATROSKA_PREFIX$codecId"
  }

  private fun containerOf(mimeType: String) = when (mimeType) {
    "video/mp4", "video/x-m4v", "video/quicktime", "audio/mp4" -> Container.MP4
    "video/webm", "audio/webm" -> Container.WEBM
    "video/x-matroska", "video/mkv", "audio/x-matroska" -> Container.MKV
    else -> null
  }

  // Keys match DIRECT_TYPES in assets/cast/receiver.js.
  private fun videoKey(container: Container, mime: String): String? = when (mime) {
    MediaFormat.MIMETYPE_VIDEO_AVC -> when (container) {
      Container.MP4 -> "mp4-h264-aac"
      Container.MKV -> "mkv-h264-aac"
      Container.WEBM -> null
    }
    MediaFormat.MIMETYPE_VIDEO_HEVC -> "mp4-hevc".takeIf { container == Container.MP4 }
    MediaFormat.MIMETYPE_VIDEO_AV1 -> "mp4-av1".takeIf { container == Container.MP4 }
    MediaFormat.MIMETYPE_VIDEO_VP9 -> "webm-vp9-opus".takeIf { container == Container.WEBM }
    MediaFormat.MIMETYPE_VIDEO_VP8 -> "webm-vp8-vorbis".takeIf { container == Container.WEBM }
    else -> null
  }

  private fun audioKey(mime: String): String? = when (mime) {
    MediaFormat.MIMETYPE_AUDIO_AAC -> "audio-aac"
    MediaFormat.MIMETYPE_AUDIO_MPEG -> "audio-mp3"
    MediaFormat.MIMETYPE_AUDIO_OPUS -> "audio-opus"
    MediaFormat.MIMETYPE_AUDIO_VORBIS -> "webm-vp8-vorbis"
    MediaFormat.MIMETYPE_AUDIO_FLAC -> "audio-flac"
    MediaFormat.MIMETYPE_AUDIO_AC3 -> "audio-ac3"
    MediaFormat.MIMETYPE_AUDIO_EAC3 -> "audio-eac3"
    else -> null
  }

  private fun supported(direct: JSONObject, key: String) = direct.optString(key).let { it == "probably" || it == "maybe" }

  private fun codecName(mime: String) = when (mime) {
    MediaFormat.MIMETYPE_VIDEO_AVC -> "H.264"
    MediaFormat.MIMETYPE_VIDEO_HEVC -> "HEVC"
    MediaFormat.MIMETYPE_VIDEO_AV1 -> "AV1"
    MediaFormat.MIMETYPE_VIDEO_VP9 -> "VP9"
    MediaFormat.MIMETYPE_VIDEO_VP8 -> "VP8"
    MediaFormat.MIMETYPE_VIDEO_MPEG4 -> "MPEG-4"
    MediaFormat.MIMETYPE_VIDEO_MPEG2 -> "MPEG-2"
    MediaFormat.MIMETYPE_AUDIO_AAC -> "AAC"
    MediaFormat.MIMETYPE_AUDIO_AC3 -> "Dolby AC-3"
    MediaFormat.MIMETYPE_AUDIO_EAC3 -> "Dolby E-AC-3"
    "audio/vnd.dts", "audio/vnd.dts.hd" -> "DTS"
    "audio/true-hd" -> "Dolby TrueHD"
    MediaFormat.MIMETYPE_AUDIO_MPEG -> "MP3"
    MediaFormat.MIMETYPE_AUDIO_OPUS -> "Opus"
    MediaFormat.MIMETYPE_AUDIO_VORBIS -> "Vorbis"
    MediaFormat.MIMETYPE_AUDIO_FLAC -> "FLAC"
    MediaFormat.MIMETYPE_AUDIO_RAW -> "PCM"
    else -> if (mime.startsWith(MATROSKA_PREFIX)) mime.removePrefix(MATROSKA_PREFIX).substringAfter('_') else mime.substringAfter('/').uppercase()
  }

  private const val MATROSKA_PREFIX = "matroska/"
}
