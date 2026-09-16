package expo.modules.vlcplayer.cast

import android.util.Base64
import java.io.BufferedInputStream
import java.io.ByteArrayOutputStream
import java.io.EOFException
import java.io.IOException
import java.io.OutputStream
import java.net.Socket
import java.security.MessageDigest

/**
 * Server side of RFC 6455: text and binary messages, ping/pong and close. One thread reads; writes from any thread are
 * serialized.
 */
internal class CastWebSocket(private val socket: Socket, private val input: BufferedInputStream) {
  private val output: OutputStream = socket.getOutputStream()
  private val writeLock = Any()

  @Volatile
  var closed = false
    private set

  /** Blocks until a whole text message arrives; null when the connection closed. Binary messages from the page are dropped. */
  @Throws(IOException::class)
  fun readText(): String? {
    val message = ByteArrayOutputStream()
    var messageOpcode = -1
    while (true) {
      val first = readByte()
      val second = readByte()
      val fin = (first and 0x80) != 0
      val opcode = first and 0x0F
      if ((second and 0x80) == 0) throw IOException("Client frame is not masked")
      var length = (second and 0x7F).toLong()
      if (length == 126L) {
        length = ((readByte() shl 8) or readByte()).toLong()
      } else if (length == 127L) {
        length = 0L
        repeat(8) { length = (length shl 8) or readByte().toLong() }
      }
      if (length < 0 || message.size() + length > MAX_MESSAGE_BYTES) throw IOException("Message too large")
      val mask = ByteArray(4).also { readFully(it) }
      val payload = ByteArray(length.toInt()).also { readFully(it) }
      for (i in payload.indices) payload[i] = (payload[i].toInt() xor mask[i % 4].toInt()).toByte()

      when (opcode) {
        OP_CLOSE -> {
          close()
          return null
        }
        OP_PING -> send(OP_PONG, payload)
        OP_PONG -> Unit
        OP_TEXT, OP_BINARY, OP_CONTINUATION -> {
          if (opcode != OP_CONTINUATION) {
            messageOpcode = opcode
            message.reset()
          }
          message.write(payload)
          if (fin) {
            if (messageOpcode == OP_TEXT) return message.toString(Charsets.UTF_8.name())
            message.reset()
          }
        }
        else -> throw IOException("Unknown opcode $opcode")
      }
    }
  }

  fun sendText(text: String): Boolean = send(OP_TEXT, text.toByteArray(Charsets.UTF_8))

  fun sendBinary(data: ByteArray): Boolean = send(OP_BINARY, data)

  /** False when the connection is gone. */
  private fun send(opcode: Int, payload: ByteArray): Boolean {
    if (closed) return false
    val header = ByteArray(10)
    var size = 0
    header[size++] = (0x80 or opcode).toByte()
    when {
      payload.size < 126 -> header[size++] = payload.size.toByte()
      payload.size <= 0xFFFF -> {
        header[size++] = 126.toByte()
        header[size++] = (payload.size shr 8).toByte()
        header[size++] = payload.size.toByte()
      }
      else -> {
        header[size++] = 127.toByte()
        for (shift in 56 downTo 0 step 8) header[size++] = (payload.size.toLong() shr shift).toByte()
      }
    }
    return try {
      synchronized(writeLock) {
        output.write(header, 0, size)
        output.write(payload)
        output.flush()
      }
      true
    } catch (e: IOException) {
      close()
      false
    }
  }

  fun close() {
    if (closed) return
    closed = true
    try {
      synchronized(writeLock) {
        output.write(byteArrayOf((0x80 or OP_CLOSE).toByte(), 0))
        output.flush()
      }
    } catch (_: IOException) {
    }
    try {
      socket.close()
    } catch (_: IOException) {
    }
  }

  private fun readByte(): Int {
    val value = input.read()
    if (value < 0) throw EOFException()
    return value
  }

  private fun readFully(buffer: ByteArray) {
    var offset = 0
    while (offset < buffer.size) {
      val read = input.read(buffer, offset, buffer.size - offset)
      if (read < 0) throw EOFException()
      offset += read
    }
  }

  companion object {
    private const val GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
    private const val MAX_MESSAGE_BYTES = 64 * 1024L

    private const val OP_CONTINUATION = 0x0
    private const val OP_TEXT = 0x1
    private const val OP_BINARY = 0x2
    private const val OP_CLOSE = 0x8
    private const val OP_PING = 0x9
    private const val OP_PONG = 0xA

    fun acceptKey(clientKey: String): String {
      val digest = MessageDigest.getInstance("SHA-1").digest((clientKey.trim() + GUID).toByteArray(Charsets.US_ASCII))
      return Base64.encodeToString(digest, Base64.NO_WRAP)
    }
  }
}
