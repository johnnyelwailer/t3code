// Fork files use the t3team- prefix, which is not a Kotlin class identifier.
@file:Suppress("ktlint:standard:filename", "MatchingDeclarationName")

package expo.modules.t3terminal

import java.io.ByteArrayOutputStream
import java.io.IOException
import java.net.Socket
import java.net.SocketTimeoutException
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.security.SecureRandom

/** Outcome of the loopback handshake. `initial` holds every byte read, to be forwarded unchanged. */
sealed interface LoopbackAdmission {
  class Allowed(val initial: ByteArray) : LoopbackAdmission

  /** `reason` is a fixed token (never request content) so it is safe to log. */
  class Denied(val reason: String) : LoopbackAdmission
}

/**
 * Pure admission logic for the per-tunnel loopback listener. The listener is reachable by every app
 * on the phone, so a connection only reaches the broker stream when its first HTTP request head
 * carries this tunnel's secret as the `t3lb<port>` cookie (delivered by the module itself into the
 * app's cookie jar, so every in-app HTTP/WebSocket/WebView client sends it) or the `X-T3-Loopback`
 * header. No Android or OkHttp types here, so the JVM tests cover it.
 */
object NexiLoopbackAuth {
  const val HEADER = "x-t3-loopback"
  const val MAX_HEAD_BYTES = 16 * 1024
  private val HEAD_END = byteArrayOf(13, 10, 13, 10)

  fun cookieName(port: Int) = "t3lb$port"

  /** 256 random bits as hex: cookie-safe and never derived from the port or session. */
  fun newSecret(random: SecureRandom = SecureRandom()): String {
    val bytes = ByteArray(32)
    random.nextBytes(bytes)
    return bytes.joinToString("") { "%02x".format(it) }
  }

  /** Constant-time: both sides are hashed to equal length, then compared without early exit. */
  fun matches(expected: String, presented: String): Boolean {
    val sha = { value: String ->
      MessageDigest.getInstance("SHA-256").digest(value.toByteArray(StandardCharsets.UTF_8))
    }
    return MessageDigest.isEqual(sha(expected), sha(presented))
  }

  /** Every credential the head presents for this port: the tunnel cookie and the explicit header. */
  fun presented(head: String, port: Int): List<String> {
    val found = mutableListOf<String>()
    for (line in head.split("\r\n").drop(1)) {
      val colon = line.indexOf(':')
      if (colon <= 0) continue
      val value = line.substring(colon + 1).trim()
      when (line.substring(0, colon).trim().lowercase()) {
        HEADER -> found += value
        "cookie" -> found += cookieValues(value, cookieName(port))
      }
    }
    return found
  }

  private fun cookieValues(header: String, name: String) = header.split(';')
    .map { it.trim() }
    .filter { it.contains('=') && it.substringBefore('=') == name }
    .map { it.substringAfter('=') }

  fun authorized(head: String, port: Int, secret: String): Boolean {
    var ok = false
    // No short-circuit: the work done does not depend on which candidate matched.
    for (candidate in presented(head, port)) ok = matches(secret, candidate) or ok
    return ok
  }

  /** Reads the first request head within one overall deadline; the caller closes on `Denied`. */
  fun admit(tcp: Socket, port: Int, secret: String, timeoutMs: Long): LoopbackAdmission =
    when (val read = readHead(tcp, timeoutMs)) {
      is LoopbackAdmission.Denied -> read
      is LoopbackAdmission.Allowed -> decide(read.initial, port, secret)
    }

  private fun decide(bytes: ByteArray, port: Int, secret: String): LoopbackAdmission {
    val head = String(bytes, 0, indexOf(bytes), StandardCharsets.ISO_8859_1)
    val reason = when {
      presented(head, port).isEmpty() -> "no-credential"
      !authorized(head, port, secret) -> "bad-credential"
      else -> null
    }
    return if (reason ==
      null
    ) {
      LoopbackAdmission.Allowed(bytes)
    } else {
      LoopbackAdmission.Denied(reason)
    }
  }

  /** `Allowed` here only means a complete head was read; [decide] checks the credential. */
  private fun readHead(tcp: Socket, timeoutMs: Long): LoopbackAdmission {
    val deadline = System.nanoTime() + timeoutMs * 1_000_000
    val read = ByteArrayOutputStream()
    var denial: String? = null
    try {
      while (denial == null && indexOf(read.toByteArray()) < 0) {
        denial = readChunk(tcp, read, deadline)
      }
      tcp.soTimeout = 0
    } catch (_: SocketTimeoutException) {
      denial = "head-timeout"
    } catch (_: IOException) {
      denial = "io-error"
    }
    return denial?.let { LoopbackAdmission.Denied(it) }
      ?: LoopbackAdmission.Allowed(read.toByteArray())
  }

  /** Appends one chunk; returns the denial reason, or null to keep reading. */
  private fun readChunk(tcp: Socket, read: ByteArrayOutputStream, deadline: Long): String? {
    val remaining = (deadline - System.nanoTime()) / 1_000_000
    return when {
      read.size() > MAX_HEAD_BYTES -> "head-too-large"
      remaining <= 0 -> "head-timeout"
      else -> {
        tcp.soTimeout = remaining.toInt()
        val chunk = ByteArray(2048)
        val count = tcp.getInputStream().read(chunk)
        if (count >= 0) read.write(chunk, 0, count)
        if (count < 0) "closed-before-head" else null
      }
    }
  }

  private fun indexOf(bytes: ByteArray): Int {
    for (start in 0..bytes.size - HEAD_END.size) {
      if (HEAD_END.indices.all { bytes[start + it] == HEAD_END[it] }) return start
    }
    return -1
  }
}
