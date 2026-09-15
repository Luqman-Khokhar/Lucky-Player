package expo.modules.vlcplayer

import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject

/**
 * Owns the saved sound settings and keeps the global effects and the notification service in line with them.
 *
 * JS sends a request: its settings object, the boost limit, every preset's band levels and the custom levels. The
 * request is saved natively so notification buttons can change the settings while JS is not running; JS then hears
 * about those changes through [listener].
 */
object SoundEffectsController {
  const val BOOST_STEP_PERCENT = 10

  private const val TAG = "SoundEffects"
  private const val PREFS = "lucky_player_sound"
  private const val KEY_REQUEST = "request"
  private const val CUSTOM_PRESET = "custom"
  private const val DEFAULT_BOOST_LIMIT = 50

  /** Receives the settings JSON after a change made outside JS, such as a notification button. */
  @Volatile
  var listener: ((String) -> Unit)? = null

  private var lastRequestJson: String? = null
  private var appliedKey: String? = null
  private var lastStatus: Map<String, Any> = emptyMap()

  /** What the notification shows. `presetIndex` is -1 and `presetLabel` null for the custom sound. */
  data class Snapshot(
    val boostEnabled: Boolean,
    val boostPercent: Int,
    val boostLimit: Int,
    val equalizerEnabled: Boolean,
    val equalizerAvailable: Boolean,
    val presetLabel: String?,
    val presetIndex: Int,
    val presetCount: Int
  )

  /** The settings object JS saved last, or null before the first save. */
  @Synchronized
  fun storedSettings(context: Context): String? = loadRequest(context)?.optJSONObject("settings")?.toString()

  /** From JS: saves the request, applies the effects and starts or stops the notification service. */
  @Synchronized
  fun update(context: Context, requestJson: String): Map<String, Any> {
    if (requestJson == lastRequestJson) return lastStatus
    val request = JSONObject(requestJson)
    lastRequestJson = requestJson
    save(context, request)
    val status = apply(request)
    syncService(context, request)
    return status
  }

  /** After Android restarted the service in a new process: the effects died with the old one. */
  @Synchronized
  fun reapply(context: Context) {
    loadRequest(context)?.let { apply(it) }
  }

  @Synchronized
  fun isActive(context: Context): Boolean = loadRequest(context)?.let { isActive(it) } ?: false

  /** Raises or lowers the boost within 0..limit. Lowering to 0 keeps the boost on; + turns a switched-off boost on. */
  @Synchronized
  fun boostBy(context: Context, deltaPercent: Int) = mutate(context) { settings, request ->
    if (!settings.optBoolean("boostEnabled")) {
      if (deltaPercent > 0) settings.put("boostEnabled", true)
      return@mutate
    }
    val limit = request.optInt("boostLimit", DEFAULT_BOOST_LIMIT)
    settings.put("boostPercent", (settings.optInt("boostPercent") + deltaPercent).coerceIn(0, limit))
  }

  @Synchronized
  fun toggleBoost(context: Context) = mutate(context) { settings, _ ->
    settings.put("boostEnabled", !settings.optBoolean("boostEnabled"))
  }

  @Synchronized
  fun toggleEqualizer(context: Context) = mutate(context) { settings, _ ->
    settings.put("equalizerEnabled", !settings.optBoolean("equalizerEnabled"))
  }

  /** Turns the equalizer on, or moves `step` presets along (wrapping) when it is already on. Custom goes to the first. */
  @Synchronized
  fun stepPreset(context: Context, step: Int) = mutate(context) { settings, request ->
    val ids = presetIds(request)
    if (ids.isEmpty()) return@mutate
    if (!settings.optBoolean("equalizerEnabled")) {
      settings.put("equalizerEnabled", true)
      return@mutate
    }
    val index = ids.indexOf(settings.optString("presetId"))
    val next = if (index < 0) 0 else (index + step).mod(ids.size)
    settings.put("presetId", ids[next])
  }

  @Synchronized
  fun snapshot(context: Context): Snapshot? {
    val request = loadRequest(context) ?: return null
    val settings = request.optJSONObject("settings") ?: return null
    val ids = presetIds(request)
    val presetId = settings.optString("presetId")
    return Snapshot(
      boostEnabled = settings.optBoolean("boostEnabled"),
      boostPercent = settings.optInt("boostPercent").coerceIn(0, 100),
      boostLimit = request.optInt("boostLimit", DEFAULT_BOOST_LIMIT),
      equalizerEnabled = settings.optBoolean("equalizerEnabled"),
      equalizerAvailable = ids.isNotEmpty(),
      presetLabel = if (presetId == CUSTOM_PRESET) null else presetById(request, presetId)?.optString("label"),
      presetIndex = ids.indexOf(presetId),
      presetCount = ids.size
    )
  }

  @Synchronized
  fun turnOff(context: Context) = mutate(context) { settings, _ ->
    settings.put("boostEnabled", false)
    settings.put("equalizerEnabled", false)
  }

  /** One line for the notification, e.g. "Boost +40% · EQ: Rock". */
  @Synchronized
  fun summary(context: Context): String {
    val request = loadRequest(context) ?: return ""
    val boostOn = request.optJSONObject("settings")?.optBoolean("boostEnabled") == true
    val boostPart = if (boostOn) "Boost +${boostPercent(request)}%" else "Boost off"
    val equalizerPart = if (equalizerLevels(request) == null) {
      "Equalizer off"
    } else {
      val presetId = request.optJSONObject("settings")?.optString("presetId").orEmpty()
      if (presetId == CUSTOM_PRESET) "EQ: Custom" else "EQ: ${presetById(request, presetId)?.optString("label") ?: "On"}"
    }
    return "$boostPart · $equalizerPart"
  }

  private fun mutate(context: Context, change: (settings: JSONObject, request: JSONObject) -> Unit) {
    val request = loadRequest(context) ?: return
    val settings = request.optJSONObject("settings") ?: return
    change(settings, request)
    save(context, request)
    lastRequestJson = null
    apply(request)
    listener?.invoke(settings.toString())
  }

  private fun apply(request: JSONObject): Map<String, Any> {
    val boost = boostPercent(request)
    val levels = equalizerLevels(request)
    val key = "$boost|${levels?.joinToString(",") ?: "off"}"
    if (key == appliedKey) return lastStatus
    lastStatus = SystemAudioEffects.apply(boost, levels)
    appliedKey = key
    Log.i(TAG, "Applied boost=$boost% equalizer=${levels?.joinToString(",") ?: "off"}")
    return lastStatus
  }

  private fun syncService(context: Context, request: JSONObject) {
    val intent = Intent(context, SoundEffectsService::class.java)
    if (!isActive(request)) {
      context.stopService(intent)
      return
    }
    intent.action = SoundEffectsService.ACTION_REFRESH
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent) else context.startService(intent)
    } catch (e: IllegalStateException) {
      // Android 12+ refuses to start it while the app is in the background; the next change from the app retries.
      Log.w(TAG, "Could not start the sound service", e)
    }
  }

  // Either switch on means the user wants the controls, even at +0% or before the equalizer is available.
  private fun isActive(request: JSONObject): Boolean {
    val settings = request.optJSONObject("settings") ?: return false
    return settings.optBoolean("boostEnabled") || settings.optBoolean("equalizerEnabled")
  }

  private fun boostPercent(request: JSONObject): Int {
    val settings = request.optJSONObject("settings") ?: return 0
    return if (settings.optBoolean("boostEnabled")) settings.optInt("boostPercent").coerceIn(0, 100) else 0
  }

  private fun equalizerLevels(request: JSONObject): List<Int>? {
    val settings = request.optJSONObject("settings") ?: return null
    if (!settings.optBoolean("equalizerEnabled")) return null
    val presetId = settings.optString("presetId")
    val levels = if (presetId == CUSTOM_PRESET) {
      request.optJSONArray("customLevelsMb")
    } else {
      presetById(request, presetId)?.optJSONArray("levelsMb")
    }
    return levels?.toIntList()?.takeIf { it.isNotEmpty() }
  }

  private fun presetIds(request: JSONObject): List<String> {
    val presets = request.optJSONArray("presets") ?: return emptyList()
    return (0 until presets.length()).mapNotNull { presets.optJSONObject(it)?.optString("id") }
  }

  private fun presetById(request: JSONObject, id: String): JSONObject? {
    val presets = request.optJSONArray("presets") ?: return null
    return (0 until presets.length()).map { presets.optJSONObject(it) }.firstOrNull { it?.optString("id") == id }
  }

  private fun JSONArray.toIntList(): List<Int> = (0 until length()).map { optInt(it) }

  private fun prefs(context: Context) = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  private fun save(context: Context, request: JSONObject) {
    prefs(context).edit().putString(KEY_REQUEST, request.toString()).apply()
  }

  private fun loadRequest(context: Context): JSONObject? {
    val raw = prefs(context).getString(KEY_REQUEST, null) ?: return null
    return try {
      JSONObject(raw)
    } catch (e: org.json.JSONException) {
      Log.w(TAG, "Saved sound settings are unreadable", e)
      null
    }
  }
}
