package expo.modules.vlcplayer

import android.app.ActivityManager
import android.content.Context
import android.hardware.display.DisplayManager
import android.media.MediaCodecInfo.CodecProfileLevel
import android.media.MediaCodecList
import android.os.Build
import android.view.Display
import org.videolan.libvlc.LibVLC

/** Reports chipset, display and decoder capabilities so JS can pick safe defaults per device. */
object DeviceProfiler {
  private val WATCHED_TYPES = mapOf(
    "video/avc" to "h264",
    "video/hevc" to "hevc",
    "video/x-vnd.on2.vp9" to "vp9",
    "video/av01" to "av1",
    "video/mp4v-es" to "mpeg4",
    "video/mpeg2" to "mpeg2",
    "video/dolby-vision" to "dolbyvision"
  )

  private val TRANSSION_BRANDS = setOf("infinix", "tecno", "itel")

  fun profile(context: Context): Map<String, Any> {
    VlcEngine.get(context) // loads native libraries before LibVLC.version()
    val activityManager = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
    val memory = ActivityManager.MemoryInfo().also { activityManager.getMemoryInfo(it) }
    val display = (context.getSystemService(Context.DISPLAY_SERVICE) as DisplayManager)
      .getDisplay(Display.DEFAULT_DISPLAY)
    val socManufacturer = if (Build.VERSION.SDK_INT >= 31) Build.SOC_MANUFACTURER else ""
    val socModel = if (Build.VERSION.SDK_INT >= 31) Build.SOC_MODEL else ""

    return mapOf(
      "manufacturer" to Build.MANUFACTURER,
      "brand" to Build.BRAND,
      "model" to Build.MODEL,
      "device" to Build.DEVICE,
      "hardware" to Build.HARDWARE,
      "board" to Build.BOARD,
      "socManufacturer" to socManufacturer,
      "socModel" to socModel,
      "androidVersion" to Build.VERSION.RELEASE,
      "sdkInt" to Build.VERSION.SDK_INT,
      "isTranssion" to (Build.BRAND.lowercase() in TRANSSION_BRANDS || Build.MANUFACTURER.lowercase() in TRANSSION_BRANDS),
      "isMediaTek" to (socManufacturer.contains("mediatek", ignoreCase = true) || Build.HARDWARE.lowercase().startsWith("mt")),
      "totalRamMb" to memory.totalMem / 1_048_576,
      "lowRamDevice" to activityManager.isLowRamDevice,
      "refreshRates" to (display?.supportedModes?.map { it.refreshRate.toDouble() }?.distinct()?.sorted() ?: emptyList()),
      "currentRefreshRate" to (display?.refreshRate?.toDouble() ?: 60.0),
      "supportedAbis" to Build.SUPPORTED_ABIS.toList(),
      "libVlcVersion" to LibVLC.version(),
      "hardwareDecoders" to decoders()
    )
  }

  private fun decoders(): List<Map<String, Any>> {
    val result = mutableListOf<Map<String, Any>>()
    for (info in MediaCodecList(MediaCodecList.REGULAR_CODECS).codecInfos) {
      if (info.isEncoder) continue
      val hardware = if (Build.VERSION.SDK_INT >= 29) {
        info.isHardwareAccelerated
      } else {
        !(info.name.startsWith("OMX.google.") || info.name.startsWith("c2.android."))
      }
      for (type in info.supportedTypes) {
        val codec = WATCHED_TYPES[type.lowercase()] ?: continue
        val capabilities = info.getCapabilitiesForType(type)
        val video = capabilities.videoCapabilities
        result += mapOf(
          "codec" to codec,
          "name" to info.name,
          "hardware" to hardware,
          "maxWidth" to (video?.supportedWidths?.upper ?: 0),
          "maxHeight" to (video?.supportedHeights?.upper ?: 0),
          "tenBit" to capabilities.profileLevels.any { isTenBit(type.lowercase(), it.profile) }
        )
      }
    }
    return result
  }

  private fun isTenBit(type: String, profile: Int): Boolean = when (type) {
    "video/hevc" -> profile == CodecProfileLevel.HEVCProfileMain10 ||
      profile == CodecProfileLevel.HEVCProfileMain10HDR10 ||
      profile == CodecProfileLevel.HEVCProfileMain10HDR10Plus
    "video/x-vnd.on2.vp9" -> profile == CodecProfileLevel.VP9Profile2 ||
      profile == CodecProfileLevel.VP9Profile3 ||
      profile == CodecProfileLevel.VP9Profile2HDR ||
      profile == CodecProfileLevel.VP9Profile3HDR
    "video/av01" -> profile == CodecProfileLevel.AV1ProfileMain10 ||
      profile == CodecProfileLevel.AV1ProfileMain10HDR10
    else -> false
  }
}
