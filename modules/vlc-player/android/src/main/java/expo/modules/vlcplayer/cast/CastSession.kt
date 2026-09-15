package expo.modules.vlcplayer.cast

import android.content.Context
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.util.Log
import org.json.JSONException
import org.json.JSONObject
import java.io.IOException
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit

/**
 * Casting state shared by the app, the service and the server: running server, pairing, connected laptops. Thread-safe;
 * [listener] is called on the main thread with the same map [snapshot] returns.
 */
object CastSession {
  private const val TAG = "CastSession"
  private const val TICK_MS = 5_000L
  private const val MAX_RECEIVERS = 4

  class NoNetworkException : Exception("No Wi-Fi or hotspot network")

  internal class Receiver(
    val id: String,
    val name: String,
    val browser: String,
    val os: String,
    val capabilities: JSONObject,
    val connectedAt: Long,
    val socket: CastWebSocket
  )

  @Volatile
  var listener: ((Map<String, Any?>) -> Unit)? = null

  private val lock = Any()
  private val mainHandler = Handler(Looper.getMainLooper())

  // Guarded by lock.
  private var appContext: Context? = null
  private var server: CastHttpServer? = null
  private var pairing: CastPairing? = null
  private var address: CastNetwork.LocalAddress? = null
  private var ticker: ScheduledExecutorService? = null
  private val receivers = LinkedHashMap<String, Receiver>()

  @Throws(IOException::class, NoNetworkException::class)
  fun start(context: Context): Map<String, Any?> {
    val app = context.applicationContext
    synchronized(lock) {
      if (server != null) return snapshotLocked()
      val local = CastNetwork.localAddress(app) ?: throw NoNetworkException()
      val http = CastHttpServer(app) { socket, request -> serveReceiver(socket, request) }
      http.start()
      appContext = app
      server = http
      address = local
      pairing = (pairing ?: CastPairing(app)).also { it.renewCode() }
      ticker = Executors.newSingleThreadScheduledExecutor { runnable ->
        Thread(runnable, "cast-ticker").apply { isDaemon = true }
      }.also { it.scheduleWithFixedDelay({ tick() }, TICK_MS, TICK_MS, TimeUnit.MILLISECONDS) }
    }
    Log.i(TAG, "Casting started")
    CastService.start(app)
    emit()
    return snapshot()
  }

  fun stop(context: Context) {
    val closing = synchronized(lock) {
      val http = server ?: return
      server = null
      ticker?.shutdownNow()
      ticker = null
      http.stop()
      receivers.values.toList().also { receivers.clear() }
    }
    val bye = message("bye", "reason" to "stopped")
    closing.forEach {
      it.socket.sendText(bye)
      it.socket.close()
    }
    Log.i(TAG, "Casting stopped")
    CastService.stop(context.applicationContext)
    emit()
  }

  /** Every laptop has to enter the code again; connected ones are disconnected. */
  fun forgetReceivers(context: Context) {
    val closing = synchronized(lock) {
      (pairing ?: CastPairing(context).also { pairing = it }).forgetAll()
      receivers.values.toList().also { receivers.clear() }
    }
    closing.forEach { it.socket.close() }
    emit()
  }

  fun snapshot(): Map<String, Any?> = synchronized(lock) { snapshotLocked() }

  private fun snapshotLocked(): Map<String, Any?> {
    val http = server
    val local = address.takeIf { http != null }
    return mapOf(
      "running" to (http != null),
      "address" to if (http != null && local != null) "http://${local.ip}:${http.port}" else null,
      "network" to local?.kind?.id,
      "code" to pairing?.code?.takeIf { http != null },
      "receivers" to receivers.values.map {
        mapOf(
          "id" to it.id,
          "name" to it.name,
          "browser" to it.browser,
          "os" to it.os,
          "connectedAt" to it.connectedAt.toDouble()
        )
      }
    )
  }

  // region Receiver connection (one server thread per laptop, blocking)

  private fun serveReceiver(socket: CastWebSocket, request: CastHttpServer.Request) {
    var hello: JSONObject? = null
    var receiver: Receiver? = null
    try {
      while (true) {
        val text = socket.readText() ?: break
        val incoming = try {
          JSONObject(text)
        } catch (_: JSONException) {
          continue
        }
        when (incoming.optString("type")) {
          "hello" -> if (receiver == null) {
            hello = incoming
            receiver = onHello(socket, incoming)
          }
          "pair" -> if (receiver == null) {
            receiver = hello?.let { onPair(socket, request, it, incoming.optString("code").trim()) }
          }
          "heartbeat" -> Unit
        }
      }
    } catch (e: IOException) {
      Log.i(TAG, "Laptop connection ended: ${e.message}")
    } finally {
      socket.close()
      receiver?.let { remove(it) }
    }
  }

  private fun onHello(socket: CastWebSocket, hello: JSONObject): Receiver? {
    val current = synchronized(lock) { pairing } ?: return null
    if (current.isPaired(hello.optString("token", null))) return accept(socket, hello)
    socket.sendText(message("need_code"))
    return null
  }

  private fun onPair(socket: CastWebSocket, request: CastHttpServer.Request, hello: JSONObject, code: String): Receiver? {
    val current = synchronized(lock) { pairing } ?: return null
    return when (val result = current.pair(code, request.remoteAddress, receiverName(hello))) {
      is CastPairing.Result.Paired -> {
        socket.sendText(message("paired", "token" to result.token))
        accept(socket, hello)
      }
      is CastPairing.Result.Refused -> {
        socket.sendText(message("pair_failed", "retryAfterMs" to result.retryAfterMs))
        // Too many wrong codes renews the code; the app has to show the new one.
        emit()
        null
      }
    }
  }

  private fun accept(socket: CastWebSocket, hello: JSONObject): Receiver? {
    val receiver = Receiver(
      id = UUID.randomUUID().toString(),
      name = receiverName(hello),
      browser = clean(hello.optString("browser")),
      os = clean(hello.optString("os")),
      capabilities = hello.optJSONObject("capabilities") ?: JSONObject(),
      connectedAt = System.currentTimeMillis(),
      socket = socket
    )
    val context = synchronized(lock) {
      if (server == null) return null
      if (receivers.size >= MAX_RECEIVERS) {
        socket.sendText(message("busy", "max" to MAX_RECEIVERS))
        return null
      }
      receivers[receiver.id] = receiver
      appContext
    }
    socket.sendText(message("welcome", "receiverId" to receiver.id, "phoneName" to phoneName(context)))
    Log.i(TAG, "Laptop connected: ${receiver.name}")
    emit()
    return receiver
  }

  private fun remove(receiver: Receiver) {
    val removed = synchronized(lock) { receivers.remove(receiver.id, receiver) }
    if (!removed) return
    Log.i(TAG, "Laptop disconnected: ${receiver.name}")
    emit()
  }

  // endregion

  private fun tick() {
    val (targets, context) = synchronized(lock) { receivers.values.toList() to appContext }
    val beat = message("heartbeat")
    targets.forEach { if (!it.socket.sendText(beat)) remove(it) }
    context ?: return
    // The phone can move to another Wi-Fi or turn its hotspot on or off while casting.
    val latest = CastNetwork.localAddress(context)
    val changed = synchronized(lock) {
      if (server == null || latest == address) return@synchronized false
      address = latest
      true
    }
    if (changed) emit()
  }

  private fun emit() {
    val state = snapshot()
    val context = synchronized(lock) { appContext }
    if (context != null && state["running"] == true) CastNotification.update(context, state)
    mainHandler.post { listener?.invoke(state) }
  }

  private fun receiverName(hello: JSONObject): String =
    listOf(clean(hello.optString("browser")), clean(hello.optString("os")))
      .filter { it.isNotEmpty() && it != "Unknown" }
      .joinToString(" · ")
      .ifEmpty { "Laptop browser" }

  private fun clean(value: String) = value.replace(Regex("[^\\p{L}\\p{N} ._-]"), "").trim().take(24)

  private fun phoneName(context: Context?): String {
    val name = if (context != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.N_MR1) {
      Settings.Global.getString(context.contentResolver, Settings.Global.DEVICE_NAME)
    } else {
      null
    }
    return name?.takeIf { it.isNotBlank() } ?: Build.MODEL
  }

  private fun message(type: String, vararg fields: Pair<String, Any?>): String =
    JSONObject().put("type", type).apply { fields.forEach { (key, value) -> put(key, value) } }.toString()
}
