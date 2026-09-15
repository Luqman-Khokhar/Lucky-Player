package expo.modules.vlcplayer.cast

import android.content.Context
import android.os.SystemClock
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Locale

/** The 4-digit code a new laptop enters once, and saved tokens that let paired laptops reconnect without it. */
internal class CastPairing(context: Context) {
  sealed interface Result {
    class Paired(val token: String) : Result
    /** [retryAfterMs] is 0 for a wrong code, or the lockout left after too many wrong codes. */
    class Refused(val retryAfterMs: Long) : Result
  }

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
    prefs.edit().putString(hash(token), receiverName).apply()
    return Result.Paired(token)
  }

  /** Stable across reconnects, so a laptop that drops and comes back continues its video. Reveals nothing about the token. */
  fun receiverId(token: String): String = hash(token).take(16)

  fun forgetAll() {
    prefs.edit().clear().apply()
  }

  private fun newCode() = String.format(Locale.US, "%04d", random.nextInt(10_000))

  private fun hash(token: String) = MessageDigest.getInstance("SHA-256").digest(token.toByteArray()).toHex()

  private fun ByteArray.toHex() = joinToString("") { "%02x".format(it) }

  companion object {
    private const val PREFS_NAME = "cast_paired_receivers"
    private const val TOKEN_BYTES = 32
    private const val MAX_FAILURES = 5
    private const val MAX_TOTAL_FAILURES = 20
    private const val LOCKOUT_MS = 30_000L
  }
}
