// Fork files use the t3team- prefix, which is not a Kotlin class identifier.
@file:Suppress("ktlint:standard:filename", "MatchingDeclarationName")

package expo.modules.t3terminal

import java.io.ByteArrayOutputStream
import java.io.IOException
import java.io.InputStream
import java.nio.charset.StandardCharsets

/** `reason` is a fixed token, never request content; `bodyBytes` is the framed body length. */
class RequestVerdict(val reason: String?, val bodyBytes: Long = 0)

/**
 * What one request on a capability-admitted connection must look like. A registered signed URL admits
 * exactly that request, so every request head is checked, not just the first: registered method and
 * target, strict CRLF framing, no folding, no Upgrade/Expect/Transfer-Encoding, a single numeric
 * Content-Length (none on a read, required on a POST) within the cap.
 */
object NexiRequestRules {
  private val DIGITS = Regex("[0-9]{1,19}")

  fun verify(
    head: String,
    allowed: (method: String, target: String) -> Boolean,
    limits: LoopbackLimits
  ): RequestVerdict {
    val framing = framingProblem(head)
    val line = NexiCapabilityTargets.requestLine(head)
    val target = line?.let { NexiCapabilityTargets.normalize(it.second) }
    val method = line?.first.orEmpty()
    val request = when {
      framing != null -> framing
      line == null -> "bad-request-line"
      method !in NexiCapabilityTargets.METHODS -> "method"
      target == null -> "bad-target"
      !allowed(method, target) -> "not-registered"
      else -> null
    }
    return request?.let { RequestVerdict(it) } ?: headers(head, method, limits)
  }

  private fun framingProblem(head: String): String? {
    val bare = head.indices.any {
      (head[it] == '\n' && (it == 0 || head[it - 1] != '\r')) ||
        (head[it] == '\r' && (it + 1 >= head.length || head[it + 1] != '\n')) ||
        head[it] == '\u0000'
    }
    return if (bare) "bad-framing" else null
  }

  private fun headers(head: String, method: String, limits: LoopbackLimits): RequestVerdict {
    var length: String? = null
    for (line in head.split("\r\n").drop(1)) {
      val problem = headerProblem(line, length != null)
      if (problem != null) return RequestVerdict(problem)
      if (line.substringBefore(':').lowercase() == "content-length") {
        length = line.substringAfter(':').trim()
      }
    }
    return body(length, method, limits)
  }

  private fun headerProblem(line: String, lengthSeen: Boolean): String? {
    val colon = line.indexOf(':')
    val name = if (colon > 0) line.substring(0, colon) else ""
    return when {
      line.startsWith(" ") || line.startsWith("\t") -> "folded-header"
      colon <= 0 || name != name.trim() || name.any { it.isWhitespace() } -> "bad-header-name"
      else -> fieldProblem(
        name.lowercase(),
        line.substring(colon + 1).trim().lowercase(),
        lengthSeen
      )
    }
  }

  private fun fieldProblem(lower: String, value: String, lengthSeen: Boolean): String? = when {
    lower == "transfer-encoding" -> "transfer-encoding"
    lower == "upgrade" || lower == "expect" -> lower
    lower == "connection" && value.contains("upgrade") -> "upgrade"
    lower == "content-length" && lengthSeen -> "duplicate-content-length"
    else -> null
  }

  /** The head with every `Connection` header replaced by `Connection: close`. */
  fun closing(head: ByteArray): ByteArray {
    val end = NexiLoopbackHead.headEnd(head)
    val lines = String(head, 0, end, StandardCharsets.ISO_8859_1).split("\r\n")
    val kept = lines.filterIndexed { index, line ->
      index == 0 || !line.substringBefore(':').trim().equals("connection", ignoreCase = true)
    }
    return (kept + "Connection: close").joinToString(
      "\r\n"
    ).toByteArray(StandardCharsets.ISO_8859_1) +
      head.copyOfRange(end, head.size)
  }

  private fun body(length: String?, method: String, limits: LoopbackLimits): RequestVerdict {
    val bytes = length?.takeIf { DIGITS.matches(it) }?.toLongOrNull()
    return when {
      length != null && bytes == null -> RequestVerdict("bad-content-length")
      bytes != null && bytes > limits.maxCapabilityBodyBytes -> RequestVerdict("body-too-large")
      method == "POST" && bytes == null -> RequestVerdict("length-required")
      method != "POST" && (bytes ?: 0L) != 0L -> RequestVerdict("body-on-read")
      else -> RequestVerdict(null, bytes ?: 0L)
    }
  }
}

/**
 * The client-to-host bytes of a capability-admitted connection: exactly one request. The head goes
 * out with `Connection: close` (so the host ends the connection after answering) and any
 * `t3lb` cookie removed, a POST body is copied through by Content-Length without being inspected, and
 * after that nothing more may arrive: a byte read past the request (a pipelined request, an upgrade
 * handshake, anything) is refused and ends the connection. Native clients open a fresh connection per
 * request, which is admitted afresh against the registered URL. `onRefused` gets a fixed reason.
 */
class CapabilityRequestStream(
  private val source: InputStream,
  initial: ByteArray,
  private val allowed: (method: String, target: String) -> Boolean,
  private val limits: LoopbackLimits,
  private val onRefused: (String) -> Unit
) : InputStream() {
  private val head = ByteArrayOutputStream()
  private val ready = ArrayDeque<ByteArray>()
  private var offset = 0
  private var bodyLeft = 0L
  private var done = false
  private var pendingInitial: ByteArray? = initial
  private var lastFour = 0

  override fun read(): Int {
    val one = ByteArray(1)
    return if (read(one, 0, 1) < 0) -1 else one[0].toInt() and 0xff
  }

  override fun read(buffer: ByteArray, off: Int, len: Int): Int {
    var eof = false
    while (ready.isEmpty() && !eof) {
      val chunk = pendingInitial ?: ByteArray(CHUNK).let { it.copyOf(maxOf(source.read(it), 0)) }
      eof = pendingInitial == null && chunk.isEmpty()
      pendingInitial = null
      if (!eof) feed(chunk)
    }
    if (ready.isEmpty()) return -1
    val next = ready.first()
    val count = minOf(len, next.size - offset)
    next.copyInto(buffer, off, offset, offset + count)
    offset += count
    if (offset == next.size) {
      ready.removeFirst()
      offset = 0
    }
    return count
  }

  override fun close() = source.close()

  private fun feed(bytes: ByteArray) {
    var index = 0
    while (index < bytes.size) {
      if (done) refuse("extra-bytes")
      if (bodyLeft > 0) {
        val take = minOf(bodyLeft, (bytes.size - index).toLong()).toInt()
        ready.addLast(bytes.copyOfRange(index, index + take))
        bodyLeft -= take
        index += take
        done = bodyLeft == 0L
      } else {
        lastFour = (lastFour shl 8) or (bytes[index].toInt() and 0xff)
        head.write(bytes[index++].toInt())
        if (head.size() > NexiLoopbackAuth.MAX_HEAD_BYTES) refuse("head-too-large")
        if (lastFour == HEAD_END) finishHead()
      }
    }
  }

  private fun finishHead() {
    val raw = head.toByteArray()
    val text = String(raw, 0, raw.size - 4, StandardCharsets.ISO_8859_1)
    val verdict = NexiRequestRules.verify(text, allowed, limits)
    verdict.reason?.let { refuse(it) }
    ready.addLast(NexiRequestRules.closing(NexiLoopbackHead.sanitize(raw)))
    bodyLeft = verdict.bodyBytes
    done = bodyLeft == 0L
  }

  private fun refuse(reason: String): Nothing {
    onRefused(reason)
    throw IOException("The loopback request was refused")
  }

  private companion object {
    const val CHUNK = 64 * 1024
    const val HEAD_END = 0x0d0a0d0a
  }
}
