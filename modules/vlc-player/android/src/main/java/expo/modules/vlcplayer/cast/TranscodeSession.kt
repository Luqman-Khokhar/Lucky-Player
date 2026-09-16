package expo.modules.vlcplayer.cast

import android.content.Context
import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaExtractor
import android.media.MediaFormat
import android.net.Uri
import android.util.Log
import android.view.Surface
import expo.modules.vlcplayer.VlcEngine
import java.io.IOException
import java.nio.ByteBuffer

/**
 * Converts a video the laptop browser cannot play into H.264 + AAC fragments for it: the phone decodes with its
 * hardware codecs and re-encodes, one worker thread driving extractor, decoders and encoders.
 *
 * The laptop reports how far ahead it has buffered, and conversion pauses above [MAX_BUFFER_AHEAD_MS], so a long
 * video neither runs ahead nor fills memory.
 */
internal class TranscodeSession(
  private val context: Context,
  private val media: CastMedia,
  private val startUs: Long,
  private val listener: Listener
) {
  interface Listener {
    /** The stream is ready: [mimeType] is what the page passes to MediaSource, followed by the init segment. */
    fun onInitSegment(mimeType: String, data: ByteArray)
    fun onFragment(data: ByteArray)
    fun onEnded()
    fun onError(message: String)
  }

  @Volatile
  private var running = false

  @Volatile
  private var bufferedAheadMs = 0L

  private var thread: Thread? = null

  fun start() {
    if (running) return
    running = true
    thread = Thread({ run() }, "cast-transcode").apply {
      isDaemon = true
      start()
    }
  }

  fun stop() {
    running = false
    thread?.join(STOP_TIMEOUT_MS)
    thread = null
  }

  fun setBufferedAhead(ms: Long) {
    bufferedAheadMs = ms
  }

  private fun run() {
    var pipeline: Pipeline? = null
    try {
      pipeline = Pipeline(context, media, startUs)
      pipeline.run()
      if (running) listener.onEnded()
    } catch (e: IOException) {
      Log.w(TAG, "Conversion failed", e)
      if (running) listener.onError("The phone couldn't read this video for casting.")
    } catch (e: MediaCodec.CodecException) {
      Log.w(TAG, "Codec failed", e)
      if (running) listener.onError("The phone couldn't convert this video.")
    } catch (e: IllegalStateException) {
      Log.w(TAG, "Conversion stopped", e)
      if (running) listener.onError("The phone couldn't convert this video.")
    } finally {
      pipeline?.release()
      running = false
    }
  }

  /** Everything that has to be released together; created and used on the worker thread only. */
  private inner class Pipeline(context: Context, media: CastMedia, startUs: Long) {
    private val extractor = MediaExtractor()
    private val videoTrack: Int
    private val audioTrack: Int
    private val videoDecoder: MediaCodec
    private val videoEncoder: MediaCodec
    private val encoderSurface: Surface
    private val audioDecoder: MediaCodec?
    private val audioEncoder: MediaCodec?

    private var writer: Fmp4Writer? = null
    private var videoOutputFormat: MediaFormat? = null
    private var audioOutputFormat: MediaFormat? = null
    private val pendingVideo = mutableListOf<Fmp4Writer.Sample>()
    private val pendingAudio = mutableListOf<Fmp4Writer.Sample>()
    private var videoFragmentUs = 0L
    private var extractorDone = false
    private var videoDecoderDone = false
    private var audioDecoderDone = false
    private var videoEncoderDone = false
    private var audioEncoderDone = false
    private val frameDurationUs: Long

    init {
      openSource(extractor, context, media)
      videoTrack = trackIndex(extractor, "video/")
      audioTrack = trackIndex(extractor, "audio/")
      if (videoTrack < 0) throw IOException("No video track in ${media.uri}")
      val videoFormat = extractor.getTrackFormat(videoTrack)
      val width = videoFormat.getInteger(MediaFormat.KEY_WIDTH)
      val height = videoFormat.getInteger(MediaFormat.KEY_HEIGHT)
      val frameRate = if (videoFormat.containsKey(MediaFormat.KEY_FRAME_RATE)) videoFormat.getInteger(MediaFormat.KEY_FRAME_RATE) else DEFAULT_FRAME_RATE
      frameDurationUs = 1_000_000L / frameRate.coerceIn(1, 120)

      videoEncoder = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_VIDEO_AVC)
      videoEncoder.configure(encoderFormat(width, height, frameRate), null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
      encoderSurface = videoEncoder.createInputSurface()
      videoEncoder.start()

      videoDecoder = MediaCodec.createDecoderByType(videoFormat.getString(MediaFormat.KEY_MIME)!!)
      videoFormat.setInteger(MediaFormat.KEY_PRIORITY, 0)
      videoFormat.setInteger(MediaFormat.KEY_OPERATING_RATE, MAX_OPERATING_RATE)
      videoDecoder.configure(videoFormat, encoderSurface, null, 0)
      videoDecoder.start()
      extractor.selectTrack(videoTrack)

      if (audioTrack >= 0) {
        val audioFormat = extractor.getTrackFormat(audioTrack)
        audioDecoder = MediaCodec.createDecoderByType(audioFormat.getString(MediaFormat.KEY_MIME)!!)
        audioDecoder.configure(audioFormat, null, null, 0)
        audioDecoder.start()
        extractor.selectTrack(audioTrack)
        audioEncoder = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_AUDIO_AAC)
        audioEncoder.configure(
          aacFormat(
            audioFormat.getInteger(MediaFormat.KEY_SAMPLE_RATE),
            audioFormat.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
          ),
          null,
          null,
          MediaCodec.CONFIGURE_FLAG_ENCODE
        )
        audioEncoder.start()
      } else {
        audioDecoder = null
        audioEncoder = null
      }

      if (startUs > 0) extractor.seekTo(startUs, MediaExtractor.SEEK_TO_CLOSEST_SYNC)
    }

    fun run() {
      val info = MediaCodec.BufferInfo()
      var startedAt = 0L
      var loggedAt = 0L
      var encodedFrames = 0L
      while (running && !finished()) {
        if (bufferedAheadMs > MAX_BUFFER_AHEAD_MS) {
          Thread.sleep(PACING_SLEEP_MS)
          drainEncoders(info)
          continue
        }
        // Nothing here blocks, so one slow step never holds up the others; the thread only sleeps when idle.
        var worked = false
        repeat(FEED_PER_PASS) { if (feedExtractor()) worked = true }
        if (drainVideoDecoder(info)) worked = true
        if (drainAudioDecoder(info)) worked = true
        val encoded = drainEncoders(info)
        if (encoded > 0) {
          worked = true
          encodedFrames += encoded
        }
        if (!worked) Thread.sleep(IDLE_SLEEP_MS)
        emitFragmentIfReady()

        // Conversion has to stay ahead of playback; this says by how much on this phone.
        val now = System.currentTimeMillis()
        if (startedAt == 0L && encodedFrames > 0) {
          startedAt = now
          loggedAt = now
        }
        if (startedAt > 0 && now - loggedAt >= STATS_INTERVAL_MS) {
          val seconds = (now - startedAt) / 1000.0
          Log.i(TAG, "Converted $encodedFrames frames in %.1f s (%.1f fps), laptop buffered %d ms ahead"
            .format(seconds, encodedFrames / seconds, bufferedAheadMs))
          loggedAt = now
        }
      }
      if (running) {
        emitFragment()
      }
    }

    private fun finished() = videoEncoderDone && (audioEncoder == null || audioEncoderDone)

    /** True when a sample moved; false when the source is done or no codec input buffer was free. */
    private fun feedExtractor(): Boolean {
      if (extractorDone) return false
      val trackIndex = extractor.sampleTrackIndex
      if (trackIndex < 0) {
        extractorDone = true
        queueEndOfStream(videoDecoder)
        audioDecoder?.let { queueEndOfStream(it) }
        return true
      }
      val codec = if (trackIndex == videoTrack) videoDecoder else audioDecoder ?: return false
      val index = codec.dequeueInputBuffer(0L)
      if (index < 0) return false
      val buffer = codec.getInputBuffer(index) ?: return false
      val size = extractor.readSampleData(buffer, 0)
      if (size < 0) {
        extractorDone = true
        codec.queueInputBuffer(index, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
        return true
      }
      codec.queueInputBuffer(index, 0, size, extractor.sampleTime, 0)
      extractor.advance()
      return true
    }

    private fun queueEndOfStream(codec: MediaCodec) {
      val index = codec.dequeueInputBuffer(ENCODER_INPUT_TIMEOUT_US)
      if (index >= 0) codec.queueInputBuffer(index, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
    }

    // Decoded frames go straight to the encoder's surface, so there is no pixel copy here.
    private fun drainVideoDecoder(info: MediaCodec.BufferInfo): Boolean {
      if (videoDecoderDone) return false
      val index = videoDecoder.dequeueOutputBuffer(info, 0L)
      if (index < 0) return false
      val endOfStream = info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0
      videoDecoder.releaseOutputBuffer(index, info.size > 0)
      if (endOfStream) {
        videoDecoderDone = true
        videoEncoder.signalEndOfInputStream()
      }
      return true
    }

    private fun drainAudioDecoder(info: MediaCodec.BufferInfo): Boolean {
      val decoder = audioDecoder ?: return false
      val encoder = audioEncoder ?: return false
      if (audioDecoderDone) return false
      val index = decoder.dequeueOutputBuffer(info, 0L)
      if (index < 0) return false
      if (info.size > 0) {
        // Waiting for the encoder rather than dropping the sample: a dropped one is a gap in the sound.
        val encoderIndex = encoder.dequeueInputBuffer(ENCODER_INPUT_TIMEOUT_US)
        val output = decoder.getOutputBuffer(index)
        if (encoderIndex < 0) {
          decoder.releaseOutputBuffer(index, false)
          return true
        }
        encoder.getInputBuffer(encoderIndex)?.put(output)
        encoder.queueInputBuffer(encoderIndex, 0, info.size, info.presentationTimeUs, 0)
      }
      val endOfStream = info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0
      decoder.releaseOutputBuffer(index, false)
      if (endOfStream) {
        audioDecoderDone = true
        val encoderIndex = encoder.dequeueInputBuffer(ENCODER_INPUT_TIMEOUT_US)
        if (encoderIndex >= 0) encoder.queueInputBuffer(encoderIndex, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
      }
      return true
    }

    /** Number of video frames taken from the encoder. */
    private fun drainEncoders(info: MediaCodec.BufferInfo): Int {
      var frames = 0
      while (drainEncoder(videoEncoder, info, video = true)) frames++
      audioEncoder?.let { encoder ->
        @Suppress("ControlFlowWithEmptyBody")
        while (drainEncoder(encoder, info, video = false)) {
        }
      }
      return frames
    }

    private fun drainEncoder(encoder: MediaCodec, info: MediaCodec.BufferInfo, video: Boolean): Boolean {
      if (video && videoEncoderDone) return false
      if (!video && audioEncoderDone) return false
      val index = encoder.dequeueOutputBuffer(info, 0L)
      if (index == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
        if (video) videoOutputFormat = encoder.outputFormat else audioOutputFormat = encoder.outputFormat
        openWriterIfReady()
        return true
      }
      if (index < 0) return false
      val buffer = encoder.getOutputBuffer(index)
      val isConfig = info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG != 0
      if (buffer != null && info.size > 0 && !isConfig) {
        val data = ByteArray(info.size)
        buffer.position(info.offset)
        buffer.get(data, 0, info.size)
        val keyframe = info.flags and MediaCodec.BUFFER_FLAG_KEY_FRAME != 0
        val time = (info.presentationTimeUs - startUs).coerceAtLeast(0L)
        if (video) {
          pendingVideo += Fmp4Writer.Sample(data, time, frameDurationUs, keyframe)
          videoFragmentUs += frameDurationUs
        } else {
          pendingAudio += Fmp4Writer.Sample(data, time, audioFrameDurationUs(), true)
        }
      }
      encoder.releaseOutputBuffer(index, false)
      if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) {
        if (video) videoEncoderDone = true else audioEncoderDone = true
      }
      return true
    }

    private fun audioFrameDurationUs(): Long {
      val format = audioOutputFormat ?: return 0L
      val sampleRate = format.getInteger(MediaFormat.KEY_SAMPLE_RATE).coerceAtLeast(1)
      return AAC_SAMPLES_PER_FRAME * 1_000_000L / sampleRate
    }

    // The writer needs both encoders' formats, which arrive with their first output.
    private fun openWriterIfReady() {
      if (writer != null) return
      val video = videoOutputFormat ?: return
      if (audioEncoder != null && audioOutputFormat == null) return
      val created = Fmp4Writer(video, audioOutputFormat)
      writer = created
      listener.onInitSegment(created.mimeType(), created.initSegment())
    }

    private fun emitFragmentIfReady() {
      if (videoFragmentUs >= FRAGMENT_US) emitFragment()
    }

    private fun emitFragment() {
      val current = writer ?: return
      if (pendingVideo.isEmpty() && pendingAudio.isEmpty()) return
      val data = current.fragment(pendingVideo.toList(), pendingAudio.toList())
      pendingVideo.clear()
      pendingAudio.clear()
      videoFragmentUs = 0L
      listener.onFragment(data)
    }

    fun release() {
      runCatching { videoDecoder.stop() }
      runCatching { videoDecoder.release() }
      runCatching { videoEncoder.stop() }
      runCatching { videoEncoder.release() }
      runCatching { encoderSurface.release() }
      audioDecoder?.let {
        runCatching { it.stop() }
        runCatching { it.release() }
      }
      audioEncoder?.let {
        runCatching { it.stop() }
        runCatching { it.release() }
      }
      runCatching { extractor.release() }
    }
  }

  companion object {
    private const val TAG = "TranscodeSession"
    private const val ENCODER_INPUT_TIMEOUT_US = 20_000L
    private const val FRAGMENT_US = 1_000_000L
    // A cushion for the laptop, so a slow moment in conversion does not stop playback.
    private const val MAX_BUFFER_AHEAD_MS = 25_000L
    private const val PACING_SLEEP_MS = 50L
    private const val IDLE_SLEEP_MS = 2L
    private const val FEED_PER_PASS = 4
    private const val STATS_INTERVAL_MS = 5_000L
    private const val STOP_TIMEOUT_MS = 2_000L
    private const val DEFAULT_FRAME_RATE = 30
    private const val AAC_SAMPLES_PER_FRAME = 1024L
    private const val AUDIO_BITRATE = 160_000
    private const val I_FRAME_INTERVAL_S = 2
    private const val MAX_OPERATING_RATE = 240
    /** Above this the phone would have to scale frames, which needs an OpenGL pass we do not have yet. */
    const val MAX_PIXELS = 1920 * 1088

    fun openSource(extractor: MediaExtractor, context: Context, media: CastMedia) {
      val uri = Uri.parse(media.uri)
      if (uri.scheme.equals("content", ignoreCase = true)) {
        val descriptor = VlcEngine.openContentDescriptor(context, uri) ?: throw IOException("Cannot open ${media.uri}")
        descriptor.use { extractor.setDataSource(it.fileDescriptor) }
      } else {
        extractor.setDataSource(uri.path ?: media.uri)
      }
    }

    fun trackIndex(extractor: MediaExtractor, prefix: String): Int {
      for (index in 0 until extractor.trackCount) {
        val mime = extractor.getTrackFormat(index).getString(MediaFormat.KEY_MIME) ?: continue
        if (mime.startsWith(prefix)) return index
      }
      return -1
    }

    private fun encoderFormat(width: Int, height: Int, frameRate: Int): MediaFormat =
      MediaFormat.createVideoFormat(MediaFormat.MIMETYPE_VIDEO_AVC, width, height).apply {
        setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface)
        setInteger(MediaFormat.KEY_BIT_RATE, bitrateFor(width, height))
        setInteger(MediaFormat.KEY_FRAME_RATE, frameRate)
        setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, I_FRAME_INTERVAL_S)
        setInteger(MediaFormat.KEY_PROFILE, MediaCodecInfo.CodecProfileLevel.AVCProfileHigh)
        // Ask the hardware to run flat out rather than at playback speed, so conversion stays ahead.
        setInteger(MediaFormat.KEY_PRIORITY, 0)
        setInteger(MediaFormat.KEY_OPERATING_RATE, MAX_OPERATING_RATE)
      }

    private fun aacFormat(sampleRate: Int, channels: Int): MediaFormat =
      MediaFormat.createAudioFormat(MediaFormat.MIMETYPE_AUDIO_AAC, sampleRate, channels).apply {
        setInteger(MediaFormat.KEY_AAC_PROFILE, MediaCodecInfo.CodecProfileLevel.AACObjectLC)
        setInteger(MediaFormat.KEY_BIT_RATE, AUDIO_BITRATE)
      }

    /** About 6 Mbps for 1080p, scaled by pixel count and kept within a sensible range. */
    private fun bitrateFor(width: Int, height: Int): Int =
      (6_000_000L * width * height / (1920 * 1080)).toInt().coerceIn(1_500_000, 8_000_000)
  }
}
