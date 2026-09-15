package expo.modules.vlcplayer

import android.media.audiofx.Equalizer
import android.media.audiofx.LoudnessEnhancer
import android.util.Log

/**
 * Volume boost and equalizer on the device's global audio output (session 0), so they reach every app's sound on
 * phones that still allow it. Android deprecated global effects and some phones ignore them, so every call reports
 * what the phone did with the request.
 */
object SystemAudioEffects {
  private const val TAG = "SystemAudioEffects"
  private const val GLOBAL_SESSION = 0
  private const val EFFECT_PRIORITY = 1000

  // +100% boost is +10 dB (1000 mB), roughly twice as loud.
  private const val MB_PER_BOOST_PERCENT = 10

  private var enhancer: LoudnessEnhancer? = null
  private var equalizer: Equalizer? = null

  /** Band centers in Hz and the level range in millibels of the phone's equalizer. */
  @Synchronized
  fun equalizerInfo(): Map<String, Any> {
    var probe: Equalizer? = null
    return try {
      val effect = equalizer ?: Equalizer(EFFECT_PRIORITY, GLOBAL_SESSION).also { probe = it }
      val range = effect.bandLevelRange
      mapOf(
        "ok" to true,
        "centerHz" to (0 until effect.numberOfBands).map { effect.getCenterFreq(it.toShort()) / 1000.0 },
        "minMb" to range[0].toInt(),
        "maxMb" to range[1].toInt()
      )
    } catch (e: RuntimeException) {
      Log.w(TAG, "Equalizer unavailable", e)
      mapOf("ok" to false, "error" to (e.message ?: e.javaClass.simpleName))
    } finally {
      probe?.release()
    }
  }

  /** A boost of 0 turns the boost off; null levels turn the equalizer off. Levels are millibels, one per band. */
  @Synchronized
  fun apply(boostPercent: Int, equalizerLevelsMb: List<Int>?): Map<String, Any> =
    mapOf("boost" to applyBoost(boostPercent), "equalizer" to applyEqualizer(equalizerLevelsMb))

  @Synchronized
  fun releaseAll() {
    enhancer?.release()
    enhancer = null
    equalizer?.release()
    equalizer = null
  }

  private fun applyBoost(percent: Int): Map<String, Any> {
    val clamped = percent.coerceIn(0, 100)
    if (clamped == 0) {
      enhancer?.release()
      enhancer = null
      return mapOf("ok" to true, "enabled" to false)
    }
    return try {
      val effect = enhancer ?: LoudnessEnhancer(GLOBAL_SESSION).also { enhancer = it }
      effect.setTargetGain(clamped * MB_PER_BOOST_PERCENT)
      effect.enabled = true
      mapOf("ok" to true, "enabled" to effect.enabled, "hasControl" to effect.hasControl())
    } catch (e: RuntimeException) {
      enhancer?.release()
      enhancer = null
      Log.w(TAG, "Global boost refused", e)
      mapOf("ok" to false, "enabled" to false, "error" to (e.message ?: e.javaClass.simpleName))
    }
  }

  private fun applyEqualizer(levelsMb: List<Int>?): Map<String, Any> {
    if (levelsMb == null) {
      equalizer?.release()
      equalizer = null
      return mapOf("ok" to true, "enabled" to false)
    }
    return try {
      val effect = equalizer ?: Equalizer(EFFECT_PRIORITY, GLOBAL_SESSION).also { equalizer = it }
      val range = effect.bandLevelRange
      for (band in 0 until minOf(effect.numberOfBands.toInt(), levelsMb.size)) {
        val level = levelsMb[band].coerceIn(range[0].toInt(), range[1].toInt())
        effect.setBandLevel(band.toShort(), level.toShort())
      }
      effect.enabled = true
      mapOf("ok" to true, "enabled" to effect.enabled, "hasControl" to effect.hasControl())
    } catch (e: RuntimeException) {
      equalizer?.release()
      equalizer = null
      Log.w(TAG, "Global equalizer refused", e)
      mapOf("ok" to false, "enabled" to false, "error" to (e.message ?: e.javaClass.simpleName))
    }
  }
}
