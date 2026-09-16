package expo.modules.vlcplayer.cast

import android.content.Context
import android.os.SystemClock
import android.util.Log
import org.json.JSONException
import org.json.JSONObject
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Locale

/**
 * The 4-digit code a new laptop enters once, the saved tokens that let paired laptops reconnect without it, and what
 * each of them is allowed to do.
 *
 * Entering the code is not permission to watch: a laptop waits until the phone allows it, and control of playback is
 * granted separately.
 */
internal class CastPairing(context: Context) {
  sealed interface Result {
    class Paired(val token: String) : Result
    /** [retryAfterMs] is 0 for a wrong code, or the lockout left after too many wrong codes. */
    class Refused(val retryAfterMs: Long) : Result
  }

  /** What a paired laptop may do. A new one may do nothing until the phone says otherwise. */
  class Access(val name: String, val allowed: Boolean, val canControl: Boolean)

  private class Attempts(var failures: Int = 0, var lockedUntil: Long = 0L)

  // Only SHA-256 hashes of tokens are stored, so a copy of this file cannot pair a laptop.
  private val prefs = context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
  private val random = SecureRandom()
  private val attempts = HashMap<String, Attempts>()
  private var totalFailures = 0

  @Volatile
  var code: String = newCode()
    private set

  @Synchronized
  fun renewCode() {
    code = newCode()
    totalFailures = 0
  }

  fun isPaired(token: String?): Boolean =
    token != null && token.length == TOKEN_BYTES * 2 && prefs.contains(hash(token))

  @Synchronized
  fun pair(candidate: String, remoteAddress: String, receiverName: String): Result {
    val now = SystemClock.elapsedRealtime()
    val entry = attempts.getOrPut(remoteAddress) { Attempts() }
    if (entry.lockedUntil > now) return Result.Refused(entry.lockedUntil - now)
    if (!MessageDigest.isEqual(candidate.toByteArray(), code.toByteArray())) {
      entry.failures++
      // Guesses spread over many addresses: a fresh code makes all earlier guesses worthless.
      if (++totalFailures >= MAX_TOTAL_FAILURES) renewCode()
      if (entry.failures >= MAX_FAILURES) {
        entry.failures = 0
        entry.lockedUntil = now + LOCKOUT_MS
        return Result.Refused(LOCKOUT_MS)
      }
      return Result.Refused(0L)
    }
    attempts.remove(remoteAddress)
    val token = ByteArray(TOKEN_BYTES).also { random.nextBytes(it) }.toHex()
    write(hash(token), Access(receiverName, allowed = false, canControl = false))
    return Result.Paired(token)
  }

  /** Stable across reconnects, so a laptop that drops and comes back continues its video. Reveals nothing about the token. */
  fun receiverId(token: String): String = hash(token).take(ID_LENGTH)

  fun access(token: String): Access = read(hash(token))

  /** Looked up by the short id the app works with, which is the start of the stored key. */
  fun accessById(receiverId: String): Access? {
    val key = keyFor(receiverId) ?: return null
    return read(key)
  }

  fun setAccess(receiverId: String, allowed: Boolean, canControl: Boolean) {
    val key = keyFor(receiverId) ?: return
    val current = read(key)
    // Control without being allowed to watch makes no sense.
    write(key, Access(current.name, allowed, canControl && allowed))
  }

  fun forgetAll() {
    prefs.edit().clear().apply()
  }

  private fun keyFor(receiverId: String): String? =
    prefs.all.keys.firstOrNull { it.startsWith(receiverId) && it.length == HASH_LENGTH }

  private fun read(key: String): Access {
    val stored = prefs.getString(key, null) ?: return Access("", allowed = false, canControl = false)
    return try {
      val json = JSONObject(stored)
      Access(json.optString("name"), json.optBoolean("allowed"), json.optBoolean("control"))
    } catch (e: JSONException) {
      // Paired before access was stored: the name was kept on its own, and it may watch as it did before.
      Log.i(TAG, "Upgrading a laptop paired by an older version")
      Access(stored, allowed = true, canControl = true)
    }
  }

  private fun write(key: String, access: Access) {
    val json = JSONObject()
      .put("name", access.name)
      .put("allowed", access.allowed)
      .put("control", access.canControl)
    prefs.edit().putString(key, json.toString()).apply()
  }

  private fun newCode() = String.format(Locale.US, "%04d", random.nextInt(10_000))

  private fun hash(token: String) = MessageDigest.getInstance("SHA-256").digest(token.toByteArray()).toHex()

  private fun ByteArray.toHex() = joinToString("") { "%02x".format(it) }

  companion object {
    private const val TAG = "CastPairing"
    private const val PREFS_NAME = "cast_paired_receivers"
    private const val TOKEN_BYTES = 32
    private const val ID_LENGTH = 16
    private const val HASH_LENGTH = 64
    private const val MAX_FAILURES = 5
    private const val MAX_TOTAL_FAILURES = 20
    private const val LOCKOUT_MS = 30_000L
  }
}
