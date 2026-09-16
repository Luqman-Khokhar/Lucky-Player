package expo.modules.vlcplayer.cast

import android.media.MediaFormat
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer

/**
 * Builds a fragmented MP4 byte stream for Media Source Extensions: one init segment, then a moof+mdat fragment per
 * group of samples. Video is H.264 (converted from the encoder's start-code format to length-prefixed), audio is AAC.
 * Both tracks share one fragment so the browser gets them interleaved.
 */
internal class Fmp4Writer(videoFormat: MediaFormat, audioFormat: MediaFormat?) {
  /** [durationUs] is what the next sample's timestamp is expected to be, minus this one's. */
  class Sample(val data: ByteArray, val ptsUs: Long, val durationUs: Long, val keyframe: Boolean)

  private val width = videoFormat.getInteger(MediaFormat.KEY_WIDTH)
  private val height = videoFormat.getInteger(MediaFormat.KEY_HEIGHT)
  private val sps: ByteArray
  private val pps: ByteArray
  private val audioConfig: ByteArray?
  private val audioTimescale: Int
  private val audioChannels: Int

  private var sequence = 0
  private var videoBaseTime = 0L
  private var audioBaseTime = 0L

  init {
    val parameterSets = parameterSetsOf(videoFormat)
    sps = parameterSets.first
    pps = parameterSets.second
    if (audioFormat != null) {
      audioConfig = audioFormat.getByteBuffer("csd-0")?.let { buffer ->
        ByteArray(buffer.remaining()).also { buffer.duplicate().get(it) }
      }
      audioTimescale = audioFormat.getInteger(MediaFormat.KEY_SAMPLE_RATE)
      audioChannels = audioFormat.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
    } else {
      audioConfig = null
      audioTimescale = 0
      audioChannels = 0
    }
  }

  val hasAudio: Boolean get() = audioConfig != null

  /** MSE codec string for this stream, e.g. `video/mp4; codecs="avc1.640028, mp4a.40.2"`. */
  fun mimeType(): String {
    val profile = "%02x%02x%02x".format(sps[1], sps[2], sps[3])
    return if (hasAudio) "video/mp4; codecs=\"avc1.$profile, mp4a.40.2\"" else "video/mp4; codecs=\"avc1.$profile\""
  }

  fun initSegment(): ByteArray {
    val output = ByteArrayOutputStream()
    output.write(ftyp())
    output.write(moov())
    return output.toByteArray()
  }

  /**
   * One media segment. [videoSamples] come from the encoder in start-code format; [audioSamples] are raw AAC frames.
   * Timestamps are relative to the start of the stream.
   */
  fun fragment(videoSamples: List<Sample>, audioSamples: List<Sample>): ByteArray {
    val video = videoSamples.map { Sample(annexBToAvcc(it.data), it.ptsUs, it.durationUs, it.keyframe) }
    val audio = if (hasAudio) audioSamples else emptyList()
    val videoBytes = video.sumOf { it.data.size }
    val audioBytes = audio.sumOf { it.data.size }

    var moofSize = BOX_HEADER + MFHD_SIZE
    if (video.isNotEmpty()) moofSize += trafSize(video.size)
    if (audio.isNotEmpty()) moofSize += trafSize(audio.size)
    val videoOffset = moofSize + BOX_HEADER
    val audioOffset = videoOffset + videoBytes

    val moof = ByteArrayOutputStream()
    moof.write(int32(MFHD_SIZE))
    moof.write(type("mfhd"))
    moof.write(int32(0))
    moof.write(int32(++sequence))
    // Each fragment starts at its first sample's own timestamp. Adding up rounded durations instead would drift,
    // which shows as sound sliding away from the picture and a delay that keeps growing.
    if (video.isNotEmpty()) {
      videoBaseTime = scale(video.first().ptsUs, VIDEO_TIMESCALE)
      moof.write(traf(VIDEO_TRACK_ID, VIDEO_TIMESCALE, videoBaseTime, video, videoOffset))
    }
    if (audio.isNotEmpty()) {
      audioBaseTime = scale(audio.first().ptsUs, audioTimescale)
      moof.write(traf(AUDIO_TRACK_ID, audioTimescale, audioBaseTime, audio, audioOffset))
    }

    val output = ByteArrayOutputStream(moofSize + BOX_HEADER + videoBytes + audioBytes)
    output.write(box("moof", moof.toByteArray()))
    output.write(int32(BOX_HEADER + videoBytes + audioBytes))
    output.write(type("mdat"))
    video.forEach { output.write(it.data) }
    audio.forEach { output.write(it.data) }
    return output.toByteArray()
  }

  // region Init segment boxes

  private fun ftyp(): ByteArray {
    val body = ByteArrayOutputStream()
    body.write(type("iso6"))
    body.write(int32(1))
    listOf("isom", "iso6", "avc1", "mp41", "dash").forEach { body.write(type(it)) }
    return box("ftyp", body.toByteArray())
  }

  private fun moov(): ByteArray {
    val body = ByteArrayOutputStream()
    body.write(mvhd())
    body.write(videoTrak())
    if (hasAudio) body.write(audioTrak())
    val mvex = ByteArrayOutputStream()
    mvex.write(trex(VIDEO_TRACK_ID))
    if (hasAudio) mvex.write(trex(AUDIO_TRACK_ID))
    body.write(box("mvex", mvex.toByteArray()))
    return box("moov", body.toByteArray())
  }

  private fun mvhd(): ByteArray {
    val body = ByteArrayOutputStream()
    body.write(int32(0)) // version and flags
    body.write(int32(0)) // creation time
    body.write(int32(0)) // modification time
    body.write(int32(MOVIE_TIMESCALE))
    body.write(int32(0)) // duration: unknown, the stream is live
    body.write(int32(0x00010000)) // rate 1.0
    body.write(int16(0x0100)) // volume 1.0
    body.write(ByteArray(10))
    body.write(UNITY_MATRIX)
    body.write(ByteArray(24))
    body.write(int32(AUDIO_TRACK_ID + 1))
    return box("mvhd", body.toByteArray())
  }

  private fun videoTrak(): ByteArray {
    val stsd = ByteArrayOutputStream()
    stsd.write(int32(0))
    stsd.write(int32(1))
    stsd.write(avc1())
    val body = ByteArrayOutputStream()
    body.write(tkhd(VIDEO_TRACK_ID, volume = 0, width = width, height = height))
    body.write(mdia("vide", "VideoHandler", VIDEO_TIMESCALE, vmhd(), box("stsd", stsd.toByteArray())))
    return box("trak", body.toByteArray())
  }

  private fun audioTrak(): ByteArray {
    val stsd = ByteArrayOutputStream()
    stsd.write(int32(0))
    stsd.write(int32(1))
    stsd.write(mp4a())
    val body = ByteArrayOutputStream()
    body.write(tkhd(AUDIO_TRACK_ID, volume = 0x0100, width = 0, height = 0))
    body.write(mdia("soun", "SoundHandler", audioTimescale, smhd(), box("stsd", stsd.toByteArray())))
    return box("trak", body.toByteArray())
  }

  private fun tkhd(trackId: Int, volume: Int, width: Int, height: Int): ByteArray {
    val body = ByteArrayOutputStream()
    body.write(byteArrayOf(0, 0, 0, 7)) // version 0, flags: enabled, in movie, in preview
    body.write(int32(0))
    body.write(int32(0))
    body.write(int32(trackId))
    body.write(int32(0))
    body.write(int32(0)) // duration
    body.write(ByteArray(8))
    body.write(int16(0)) // layer
    body.write(int16(0)) // alternate group
    body.write(int16(volume))
    body.write(int16(0))
    body.write(UNITY_MATRIX)
    body.write(int32(width shl 16))
    body.write(int32(height shl 16))
    return box("tkhd", body.toByteArray())
  }

  private fun mdia(handler: String, handlerName: String, timescale: Int, headerBox: ByteArray, stsd: ByteArray): ByteArray {
    val mdhd = ByteArrayOutputStream()
    mdhd.write(int32(0))
    mdhd.write(int32(0))
    mdhd.write(int32(0))
    mdhd.write(int32(timescale))
    mdhd.write(int32(0)) // duration
    mdhd.write(int16(0x55C4)) // language "und"
    mdhd.write(int16(0))

    val hdlr = ByteArrayOutputStream()
    hdlr.write(int32(0))
    hdlr.write(int32(0))
    hdlr.write(type(handler))
    hdlr.write(ByteArray(12))
    hdlr.write(handlerName.toByteArray(Charsets.US_ASCII))
    hdlr.write(0)

    val stbl = ByteArrayOutputStream()
    stbl.write(stsd)
    stbl.write(emptyTable("stts"))
    stbl.write(emptyTable("stsc"))
    stbl.write(box("stsz", int32(0) + int32(0) + int32(0)))
    stbl.write(emptyTable("stco"))

    val minf = ByteArrayOutputStream()
    minf.write(headerBox)
    minf.write(dinf())
    minf.write(box("stbl", stbl.toByteArray()))

    val body = ByteArrayOutputStream()
    body.write(box("mdhd", mdhd.toByteArray()))
    body.write(box("hdlr", hdlr.toByteArray()))
    body.write(box("minf", minf.toByteArray()))
    return box("mdia", body.toByteArray())
  }

  private fun vmhd() = box("vmhd", byteArrayOf(0, 0, 0, 1) + ByteArray(8))

  private fun smhd() = box("smhd", int32(0) + int32(0))

  private fun dinf(): ByteArray {
    val url = box("url ", byteArrayOf(0, 0, 0, 1))
    val dref = box("dref", int32(0) + int32(1) + url)
    return box("dinf", dref)
  }

  private fun emptyTable(name: String) = box(name, int32(0) + int32(0))

  private fun avc1(): ByteArray {
    val body = ByteArrayOutputStream()
    body.write(ByteArray(6))
    body.write(int16(1)) // data reference index
    body.write(ByteArray(16))
    body.write(int16(width))
    body.write(int16(height))
    body.write(int32(0x00480000)) // 72 dpi horizontal
    body.write(int32(0x00480000)) // 72 dpi vertical
    body.write(int32(0))
    body.write(int16(1)) // frame count
    body.write(ByteArray(32)) // compressor name
    body.write(int16(0x0018)) // depth
    body.write(int16(-1))

    val avcc = ByteArrayOutputStream()
    avcc.write(1)
    avcc.write(sps[1].toInt())
    avcc.write(sps[2].toInt())
    avcc.write(sps[3].toInt())
    avcc.write(0xFF) // 4-byte NAL lengths
    avcc.write(0xE1) // one SPS
    avcc.write(int16(sps.size))
    avcc.write(sps)
    avcc.write(1) // one PPS
    avcc.write(int16(pps.size))
    avcc.write(pps)
    body.write(box("avcC", avcc.toByteArray()))
    return box("avc1", body.toByteArray())
  }

  private fun mp4a(): ByteArray {
    val config = audioConfig ?: ByteArray(0)
    val body = ByteArrayOutputStream()
    body.write(ByteArray(6))
    body.write(int16(1)) // data reference index
    body.write(ByteArray(8))
    body.write(int16(audioChannels))
    body.write(int16(16)) // sample size
    body.write(int32(0))
    body.write(int32(audioTimescale shl 16))

    // esds: ES descriptor -> decoder config (AAC) -> decoder specific info -> SL config
    val esds = ByteArrayOutputStream()
    esds.write(int32(0))
    esds.write(descriptor(0x03, int16(AUDIO_TRACK_ID) + byteArrayOf(0) +
      descriptor(0x04, byteArrayOf(0x40, 0x15) + int24(0) + int32(0) + int32(0) + descriptor(0x05, config)) +
      descriptor(0x06, byteArrayOf(0x02))))
    body.write(box("esds", esds.toByteArray()))
    return box("mp4a", body.toByteArray())
  }

  private fun trex(trackId: Int): ByteArray {
    val body = ByteArrayOutputStream()
    body.write(int32(0))
    body.write(int32(trackId))
    body.write(int32(1)) // default sample description index
    body.write(int32(0))
    body.write(int32(0))
    body.write(int32(0))
    return box("trex", body.toByteArray())
  }

  // endregion

  private fun traf(trackId: Int, timescale: Int, baseTime: Long, samples: List<Sample>, dataOffset: Int): ByteArray {
    val tfhd = ByteArrayOutputStream()
    tfhd.write(byteArrayOf(0, 0x02, 0, 0)) // default-base-is-moof
    tfhd.write(int32(trackId))

    val tfdt = ByteArrayOutputStream()
    tfdt.write(byteArrayOf(1, 0, 0, 0)) // version 1: 64-bit time
    tfdt.write(int64(baseTime))

    val trun = ByteArrayOutputStream()
    trun.write(byteArrayOf(0, 0, 0x07, 0x01)) // data offset, sample duration, size and flags
    trun.write(int32(samples.size))
    trun.write(int32(dataOffset))
    samples.forEach { sample ->
      trun.write(int32(scale(sample.durationUs, timescale).toInt()))
      trun.write(int32(sample.data.size))
      trun.write(int32(if (sample.keyframe) SYNC_SAMPLE_FLAGS else NON_SYNC_SAMPLE_FLAGS))
    }

    val body = ByteArrayOutputStream()
    body.write(box("tfhd", tfhd.toByteArray()))
    body.write(box("tfdt", tfdt.toByteArray()))
    body.write(box("trun", trun.toByteArray()))
    return box("traf", body.toByteArray())
  }

  private fun trafSize(sampleCount: Int) = TRAF_FIXED_SIZE + TRUN_ENTRY_SIZE * sampleCount

  private fun scale(timeUs: Long, timescale: Int) = timeUs * timescale / 1_000_000L

  companion object {
    private const val BOX_HEADER = 8
    private const val MFHD_SIZE = 16
    // traf header + tfhd + tfdt + trun without its sample entries.
    private const val TRAF_FIXED_SIZE = 8 + 16 + 20 + 20
    private const val TRUN_ENTRY_SIZE = 12
    private const val MOVIE_TIMESCALE = 1000
    private const val VIDEO_TIMESCALE = 90_000
    private const val VIDEO_TRACK_ID = 1
    private const val AUDIO_TRACK_ID = 2
    private const val SYNC_SAMPLE_FLAGS = 0x02000000
    private const val NON_SYNC_SAMPLE_FLAGS = 0x01010000

    private val UNITY_MATRIX = int32(0x00010000) + int32(0) + int32(0) +
      int32(0) + int32(0x00010000) + int32(0) +
      int32(0) + int32(0) + int32(0x40000000)

    private fun box(name: String, body: ByteArray): ByteArray = int32(BOX_HEADER + body.size) + type(name) + body

    private fun type(name: String) = name.toByteArray(Charsets.US_ASCII)

    private fun int32(value: Int) = byteArrayOf(
      (value ushr 24).toByte(), (value ushr 16).toByte(), (value ushr 8).toByte(), value.toByte()
    )

    private fun int24(value: Int) = byteArrayOf((value ushr 16).toByte(), (value ushr 8).toByte(), value.toByte())

    private fun int16(value: Int) = byteArrayOf((value ushr 8).toByte(), value.toByte())

    private fun int64(value: Long) = ByteBuffer.allocate(8).putLong(value).array()

    /** Descriptors carry their payload length in one byte; AAC configs are far below the 127-byte limit. */
    private fun descriptor(tag: Int, body: ByteArray) = byteArrayOf(tag.toByte(), body.size.toByte()) + body

    /** The encoder reports SPS and PPS in csd-0 and csd-1, each with start codes. */
    private fun parameterSetsOf(format: MediaFormat): Pair<ByteArray, ByteArray> {
      val csd0 = format.getByteBuffer("csd-0")?.let { toArray(it) } ?: ByteArray(0)
      val csd1 = format.getByteBuffer("csd-1")?.let { toArray(it) }
      if (csd1 != null && csd1.isNotEmpty()) return stripStartCode(csd0) to stripStartCode(csd1)
      // Some encoders put both sets in csd-0.
      val units = splitNalUnits(csd0)
      val sps = units.firstOrNull { it.isNotEmpty() && (it[0].toInt() and 0x1F) == 7 } ?: ByteArray(0)
      val pps = units.firstOrNull { it.isNotEmpty() && (it[0].toInt() and 0x1F) == 8 } ?: ByteArray(0)
      return sps to pps
    }

    private fun toArray(buffer: ByteBuffer): ByteArray {
      val copy = buffer.duplicate()
      return ByteArray(copy.remaining()).also { copy.get(it) }
    }

    private fun stripStartCode(data: ByteArray): ByteArray = splitNalUnits(data).firstOrNull() ?: data

    /** Splits a start-code stream (00 00 01 or 00 00 00 01) into the units between the start codes. */
    private fun splitNalUnits(data: ByteArray): List<ByteArray> {
      val units = mutableListOf<ByteArray>()
      var index = 0
      var unitStart = -1
      while (index < data.size) {
        val startCode = startCodeLengthAt(data, index)
        if (startCode > 0) {
          if (unitStart >= 0 && index > unitStart) units += data.copyOfRange(unitStart, index)
          index += startCode
          unitStart = index
        } else {
          index++
        }
      }
      if (unitStart in 0 until data.size) units += data.copyOfRange(unitStart, data.size)
      return units
    }

    private fun startCodeLengthAt(data: ByteArray, index: Int): Int {
      if (index + 3 < data.size &&
        data[index] == 0.toByte() && data[index + 1] == 0.toByte() &&
        data[index + 2] == 0.toByte() && data[index + 3] == 1.toByte()
      ) {
        return 4
      }
      if (index + 2 < data.size &&
        data[index] == 0.toByte() && data[index + 1] == 0.toByte() && data[index + 2] == 1.toByte()
      ) {
        return 3
      }
      return 0
    }

    /** MP4 samples carry each unit's length instead of a start code. */
    fun annexBToAvcc(data: ByteArray): ByteArray {
      val output = ByteArrayOutputStream(data.size + 8)
      for (unit in splitNalUnits(data)) {
        output.write(int32(unit.size))
        output.write(unit)
      }
      return output.toByteArray()
    }
  }
}
