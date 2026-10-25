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
 * app's cookie jar; WebView documents are loaded from this origin so they send it too) or the
 * `X-T3-Loopback` header, and no foreign Origin. No Android or OkHttp types here, so the JVM tests cover it.
 */
object NexiLoopbackAuth {
  const val MAX_HEAD_BYTES = 16 * 1024

  fun cookieName(port: Int) = NexiLoopbackHead.cookieName(port)

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

  fun authorized(parsed: ParsedHead, secret: String): Boolean {
    var ok = false
    // No short-circuit: the work done does not depend on which candidate matched.
    for (candidate in parsed.credentials) ok = matches(secret, candidate) or ok
    return ok
  }

  /**
   * Reads the first request head within the limits; the caller closes on `Denied`. `Allowed.initial`
   * is the head with the credential removed, followed by any bytes read past it.
   */
  fun admit(
    tcp: Socket,
    port: Int,
    secret: String,
    limits: LoopbackLimits,
    onFirstByte: () -> Unit = {}
  ): LoopbackAdmission = when (val read = readHead(tcp, limits, onFirstByte)) {
    is LoopbackAdmission.Denied -> read
    is LoopbackAdmission.Allowed -> decide(read.initial, port, secret)
  }

  private fun decide(bytes: ByteArray, port: Int, secret: String): LoopbackAdmission {
    val head = String(bytes, 0, NexiLoopbackHead.headEnd(bytes), StandardCharsets.ISO_8859_1)
    val parsed = NexiLoopbackHead.parse(head, port)
    val reason = when {
      parsed.malformed != null -> parsed.malformed
      !NexiLoopbackHead.originAllowed(parsed, port) -> "bad-origin"
      parsed.credentials.isEmpty() -> "no-credential"
      !authorized(parsed, secret) -> "bad-credential"
      else -> null
    }
    return if (reason == null) {
      LoopbackAdmission.Allowed(NexiLoopbackHead.sanitize(bytes))
    } else {
      LoopbackAdmission.Denied(reason)
    }
  }

  /** `Allowed` here only means a complete head was read; [decide] checks the credential. */
  private fun readHead(
    tcp: Socket,
    limits: LoopbackLimits,
    onFirstByte: () -> Unit
  ): LoopbackAdmission {
    val start = System.nanoTime()
    val read = ByteArrayOutputStream()
    var denial: String? = null
    try {
      while (denial == null && NexiLoopbackHead.headEnd(read.toByteArray()) < 0) {
        denial = readChunk(tcp, read, start, limits)
        if (denial == null) onFirstByte()
      }
      tcp.soTimeout = 0
    } catch (_: SocketTimeoutException) {
      denial = if (read.size() == 0) "first-byte-timeout" else "head-timeout"
    } catch (_: IOException) {
      denial = "io-error"
    }
    return denial?.let { LoopbackAdmission.Denied(it) }
      ?: LoopbackAdmission.Allowed(read.toByteArray())
  }

  /** Appends one chunk; returns the denial reason, or null to keep reading. */
  private fun readChunk(
    tcp: Socket,
    read: ByteArrayOutputStream,
    start: Long,
    limits: LoopbackLimits
  ): String? {
    // A client that has sent nothing gets the shorter first-byte deadline.
    val allowedMs = if (read.size() == 0) limits.firstByteMs else limits.headTimeoutMs
    val remaining = allowedMs - (System.nanoTime() - start) / 1_000_000
    return when {
      read.size() > MAX_HEAD_BYTES -> "head-too-large"
      remaining <= 0 -> if (read.size() == 0) "first-byte-timeout" else "head-timeout"
      else -> {
        tcp.soTimeout = remaining.toInt()
        val chunk = ByteArray(2048)
        val count = tcp.getInputStream().read(chunk)
        if (count >= 0) read.write(chunk, 0, count)
        if (count < 0) "closed-before-head" else null
      }
    }
  }
}
