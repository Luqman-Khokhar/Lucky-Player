package expo.modules.vlcplayer.cast

import android.annotation.SuppressLint
import android.content.Context
import android.hardware.display.DisplayManager
import android.media.AudioFormat
import android.media.AudioPlaybackCaptureConfiguration
import android.media.AudioRecord
import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaFormat
import android.media.projection.MediaProjection
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.Surface
import android.view.WindowManager

/**
 * Mirrors the phone screen to a laptop: the screen goes through a virtual display into the H.264 encoder, and what
 * the phone is playing is captured and re-encoded as AAC. Output is the same fragmented MP4 the converter produces.
 *
 * Android stops the projection itself when the screen locks, which arrives as [MediaProjection.Callback.onStop].
 */
internal class ScreenCastSession(
  private val context: Context,
  private val projection: MediaProjection,
  private val withAudio: Boolean,
  private val listener: TranscodeSession.Listener
) {
  @Volatile
  private var running = false

  @Volatile
  private var bufferedAheadMs = 0L

  private val handler = Handler(Looper.getMainLooper())
  private val lock = Any()

  private var videoBitrate = 0
  private var videoEncoder: MediaCodec? = null
  private var audioEncoder: MediaCodec? = null
  private var inputSurface: Surface? = null
  private var virtualDisplay: android.hardware.display.VirtualDisplay? = null
  private var recorder: AudioRecord? = null
  private var videoThread: Thread? = null
  private var audioThread: Thread? = null

  // Guarded by lock.
  private var writer: Fmp4Writer? = null
  private var videoFormat: MediaFormat? = null
  private var audioFormat: MediaFormat? = null
  private val pendingVideo = mutableListOf<Fmp4Writer.Sample>()
  private val pendingAudio = mutableListOf<Fmp4Writer.Sample>()
  private var fragmentUs = 0L
  private var baseTimeUs = -1L

  private val projectionCallback = object : MediaProjection.Callback() {
    override fun onStop() {
      Log.i(TAG, "Screen capture stopped by Android")
      if (running) listener.onEnded()
      stop()
    }
  }

  @Throws(IllegalStateException::class)
  fun start() {
    if (running) return
    running = true
    // The service already claimed the projection type, which Android 14+ requires before any capture.
    // Android also requires the callback before a virtual display exists.
    projection.registerCallback(projectionCallback, handler)
    val size = captureSize()
    val encoder = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_VIDEO_AVC)
    val format = videoFormatFor(size.first, size.second)
    videoBitrate = format.getInteger(MediaFormat.KEY_BIT_RATE)
    encoder.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
    val surface = encoder.createInputSurface()
    encoder.start()
    videoEncoder = encoder
    inputSurface = surface
    virtualDisplay = projection.createVirtualDisplay(
      "LuckyPlayerCast",
      size.first,
      size.second,
      context.resources.displayMetrics.densityDpi,
      DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
      surface,
      null,
      handler
    )
    videoThread = Thread({ guard("video") { drainVideo(encoder) } }, "cast-screen-video").apply {
      isDaemon = true
      start()
    }
    if (withAudio) startAudio()
  }

  fun stop() {
    if (!running) return
    running = false
    videoThread?.join(STOP_TIMEOUT_MS)
    audioThread?.join(STOP_TIMEOUT_MS)
    videoThread = null
    audioThread = null
    runCatching { projection.unregisterCallback(projectionCallback) }
    runCatching { virtualDisplay?.release() }
    runCatching { recorder?.stop() }
    runCatching { recorder?.release() }
    runCatching { videoEncoder?.stop() }
    runCatching { videoEncoder?.release() }
    runCatching { audioEncoder?.stop() }
    runCatching { audioEncoder?.release() }
    runCatching { inputSurface?.release() }
    runCatching { projection.stop() }
    virtualDisplay = null
    recorder = null
    videoEncoder = null
    audioEncoder = null
    inputSurface = null
    CastService.setProjecting(context, false)
  }

  fun setBufferedAhead(ms: Long) {
    bufferedAheadMs = ms
  }

  // Only audio this app and other media apps play; a phone call or notification sound is never captured.
  @SuppressLint("MissingPermission")
  private fun startAudio() {
    val configuration = AudioPlaybackCaptureConfiguration.Builder(projection)
      .addMatchingUsage(android.media.AudioAttributes.USAGE_MEDIA)
      .addMatchingUsage(android.media.AudioAttributes.USAGE_GAME)
      .addMatchingUsage(android.media.AudioAttributes.USAGE_UNKNOWN)
      .build()
    val format = AudioFormat.Builder()
      .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
      .setSampleRate(SAMPLE_RATE)
      .setChannelMask(AudioFormat.CHANNEL_IN_STEREO)
      .build()
    val minimum = AudioRecord.getMinBufferSize(SAMPLE_RATE, AudioFormat.CHANNEL_IN_STEREO, AudioFormat.ENCODING_PCM_16BIT)
    val record = AudioRecord.Builder()
      .setAudioFormat(format)
      .setBufferSizeInBytes(maxOf(minimum, AUDIO_BUFFER_BYTES))
      .setAudioPlaybackCaptureConfig(configuration)
      .build()
    val encoder = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_AUDIO_AAC)
    encoder.configure(audioFormatFor(), null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
    encoder.start()
    record.startRecording()
    recorder = record
    audioEncoder = encoder
    audioThread = Thread({ guard("audio") { captureAudio(record, encoder) } }, "cast-screen-audio").apply {
      isDaemon = true
      start()
    }
  }

  /** A failure in a capture thread must end screen sharing, never take the app down with it. */
  private fun guard(what: String, block: () -> Unit) {
    try {
      block()
    } catch (e: RuntimeException) {
      if (!running) return
      Log.w(TAG, "Screen sharing $what failed", e)
      running = false
      listener.onError("Screen sharing stopped because the phone could not keep capturing.")
      handler.post { stop() }
    }
  }

  private fun drainVideo(encoder: MediaCodec) {
    val info = MediaCodec.BufferInfo()
    val bitrate = BitrateController(videoBitrate, TARGET_AHEAD_MS)
    while (running) {
      bitrate.update(bufferedAheadMs)?.let { target ->
        Log.i(TAG, "Mirroring at ${target / 1000} kbps")
        runCatching { encoder.setParameters(Bundle().apply { putInt(MediaCodec.PARAMETER_KEY_VIDEO_BITRATE, target) }) }
      }
      if (bufferedAheadMs > MAX_BUFFER_AHEAD_MS) {
        Thread.sleep(PACING_SLEEP_MS)
        continue
      }
      val index = try {
        encoder.dequeueOutputBuffer(info, DEQUEUE_TIMEOUT_US)
      } catch (e: IllegalStateException) {
        return
      }
      if (index == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
        synchronized(lock) { videoFormat = encoder.outputFormat }
        openWriterIfReady()
        continue
      }
      if (index < 0) continue
      val isConfig = info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG != 0
      if (info.size > 0 && !isConfig) {
        val data = ByteArray(info.size)
        encoder.getOutputBuffer(index)?.let { buffer ->
          buffer.position(info.offset)
          buffer.get(data, 0, info.size)
        }
        addVideo(data, info.presentationTimeUs, info.flags and MediaCodec.BUFFER_FLAG_KEY_FRAME != 0)
      }
      encoder.releaseOutputBuffer(index, false)
    }
  }

  private fun captureAudio(record: AudioRecord, encoder: MediaCodec) {
    val buffer = ByteArray(AUDIO_CHUNK_BYTES)
    val info = MediaCodec.BufferInfo()
    while (running) {
      val read = record.read(buffer, 0, buffer.size)
      if (read > 0) {
        // The encoder's input buffers are smaller than one read, so a read is spread over as many as it takes.
        val readAtUs = System.nanoTime() / 1000L
        var offset = 0
        while (offset < read && running) {
          val index = encoder.dequeueInputBuffer(DEQUEUE_TIMEOUT_US)
          if (index < 0) break
          val input = encoder.getInputBuffer(index)
          if (input == null) {
            encoder.queueInputBuffer(index, 0, 0, 0, 0)
            break
          }
          val size = minOf(read - offset, input.remaining())
          input.put(buffer, offset, size)
          encoder.queueInputBuffer(index, 0, size, readAtUs + offset * 1_000_000L / BYTES_PER_SECOND, 0)
          offset += size
        }
      }
      while (true) {
        val index = encoder.dequeueOutputBuffer(info, 0L)
        if (index == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
          synchronized(lock) { audioFormat = encoder.outputFormat }
          openWriterIfReady()
          continue
        }
        if (index < 0) break
        val isConfig = info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG != 0
        if (info.size > 0 && !isConfig) {
          val data = ByteArray(info.size)
          encoder.getOutputBuffer(index)?.let { output ->
            output.position(info.offset)
            output.get(data, 0, info.size)
          }
          addAudio(data, info.presentationTimeUs)
        }
        encoder.releaseOutputBuffer(index, false)
      }
    }
  }

  private fun addVideo(data: ByteArray, ptsUs: Long, keyframe: Boolean) {
    var fragment: ByteArray? = null
    synchronized(lock) {
      if (writer == null) return
      if (baseTimeUs < 0) baseTimeUs = ptsUs
      val time = (ptsUs - baseTimeUs).coerceAtLeast(0L)
      val previous = pendingVideo.lastOrNull()
      // A mirrored screen has no fixed frame rate, so each frame lasts until the next one arrives.
      if (previous != null) fragmentUs += (time - previous.ptsUs).coerceAtLeast(0L)
      pendingVideo += Fmp4Writer.Sample(data, time, FRAME_GAP_US, keyframe)
      if (fragmentUs >= FRAGMENT_US) fragment = buildFragmentLocked()
    }
    fragment?.let { listener.onFragment(it) }
  }

  private fun addAudio(data: ByteArray, ptsUs: Long) {
    synchronized(lock) {
      if (writer == null || baseTimeUs < 0) return
      val time = (ptsUs - baseTimeUs).coerceAtLeast(0L)
      pendingAudio += Fmp4Writer.Sample(data, time, AAC_FRAME_US, true)
    }
  }

  private fun buildFragmentLocked(): ByteArray? {
    val current = writer ?: return null
    if (pendingVideo.isEmpty() && pendingAudio.isEmpty()) return null
    // Each sample lasts until the next; the last one keeps the nominal gap.
    val video = pendingVideo.mapIndexed { index, sample ->
      val next = pendingVideo.getOrNull(index + 1)
      val duration = if (next != null) (next.ptsUs - sample.ptsUs).coerceAtLeast(1L) else FRAME_GAP_US
      Fmp4Writer.Sample(sample.data, sample.ptsUs, duration, sample.keyframe)
    }
    val data = current.fragment(video, pendingAudio.toList())
    pendingVideo.clear()
    pendingAudio.clear()
    fragmentUs = 0L
    return data
  }

  private fun openWriterIfReady() {
    val created = synchronized(lock) {
      if (writer != null) return
      val video = videoFormat ?: return
      if (withAudio && audioFormat == null) return
      Fmp4Writer(video, audioFormat).also { writer = it }
    }
    listener.onInitSegment(created.mimeType(), created.initSegment())
  }

  private fun captureSize(): Pair<Int, Int> {
    val manager = context.getSystemService(WindowManager::class.java)
    val bounds = manager.maximumWindowMetrics.bounds
    val width = bounds.width()
    val height = bounds.height()
    val scale = minOf(1.0, MAX_WIDTH.toDouble() / maxOf(width, height), MAX_HEIGHT.toDouble() / minOf(width, height))
    // Encoders want even dimensions.
    return (width * scale).toInt() / 2 * 2 to (height * scale).toInt() / 2 * 2
  }

  private fun videoFormatFor(width: Int, height: Int): MediaFormat =
    MediaFormat.createVideoFormat(MediaFormat.MIMETYPE_VIDEO_AVC, width, height).apply {
      setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface)
      setInteger(MediaFormat.KEY_BIT_RATE, (6_000_000L * width * height / (1920 * 1080)).toInt().coerceIn(2_000_000, 8_000_000))
      setInteger(MediaFormat.KEY_FRAME_RATE, FRAME_RATE)
      setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, I_FRAME_INTERVAL_S)
      setInteger(MediaFormat.KEY_PRIORITY, 0)
      // A still screen produces no frames; without this the laptop's playback would stall.
      setInteger(MediaFormat.KEY_REPEAT_PREVIOUS_FRAME_AFTER, FRAME_GAP_US.toInt())
      // Hand each frame over as soon as it is encoded instead of holding a few back.
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) setInteger(MediaFormat.KEY_LATENCY, 1)
      // An even data rate travels over Wi-Fi better than bursts around each keyframe.
      setInteger(MediaFormat.KEY_BITRATE_MODE, MediaCodecInfo.EncoderCapabilities.BITRATE_MODE_CBR)
    }

  private fun audioFormatFor(): MediaFormat =
    MediaFormat.createAudioFormat(MediaFormat.MIMETYPE_AUDIO_AAC, SAMPLE_RATE, 2).apply {
      setInteger(MediaFormat.KEY_AAC_PROFILE, MediaCodecInfo.CodecProfileLevel.AACObjectLC)
      setInteger(MediaFormat.KEY_BIT_RATE, AUDIO_BITRATE)
    }

  companion object {
    private const val TAG = "ScreenCastSession"
    // 720p-class: a phone screen still reads well on a laptop, and less to encode and send means less delay.
    private const val MAX_WIDTH = 1280
    private const val MAX_HEIGHT = 720
    private const val FRAME_RATE = 30
    // Keyframes are big and arrive in one burst; every two seconds keeps those bursts from stalling playback.
    private const val I_FRAME_INTERVAL_S = 2
    private const val FRAME_GAP_US = 1_000_000L / FRAME_RATE
    // A mirrored screen is watched live, so everything here is sized for delay rather than for a smooth cushion:
    // a fragment every couple of frames, almost no lead, and a bitrate that aims to keep it that way.
    private const val FRAGMENT_US = 50_000L
    // The cap has to sit well above the quality controller's "doing fine" mark, or the two fight each other and the
    // picture keeps stepping up and down.
    private const val MAX_BUFFER_AHEAD_MS = 1_200L
    private const val TARGET_AHEAD_MS = 400L
    private const val PACING_SLEEP_MS = 20L
    private const val DEQUEUE_TIMEOUT_US = 10_000L
    private const val STOP_TIMEOUT_MS = 1_500L
    private const val SAMPLE_RATE = 48_000
    private const val AUDIO_BITRATE = 160_000
    private const val AUDIO_BUFFER_BYTES = 128 * 1024
    private const val AUDIO_CHUNK_BYTES = 4 * 1024
    /** 48 kHz, stereo, 16-bit: what one second of captured sound weighs. */
    private const val BYTES_PER_SECOND = SAMPLE_RATE * 2 * 2
    private const val AAC_FRAME_US = 1024L * 1_000_000L / SAMPLE_RATE
  }
}
