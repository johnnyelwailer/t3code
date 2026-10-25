// Fork files use the t3team- prefix, which is not a Kotlin class identifier.
@file:Suppress("ktlint:standard:filename", "MatchingDeclarationName")

package expo.modules.t3terminal

import java.nio.charset.StandardCharsets

/** `reason` is a fixed token, never request content. */
class RequestVerdict(val reason: String?, val bodyBytes: Long = 0)

/** How one request's body is framed. `length` is null when no Content-Length was sent. */
class Framing(
  val reason: String? = null,
  val length: Long? = null,
  val chunked: Boolean = false,
  val upgrade: Boolean = false,
  val expect: Boolean = false
)

/** What the stream does with one request head: refuse it, or rewrite and frame it. */
class RequestPlan(
  val reason: String? = null,
  val rewrite: (ByteArray) -> ByteArray = { it },
  val length: Long = 0,
  val chunked: Boolean = false,
  /** An upgraded connection is a raw pipe from here on (the WebSocket data path). */
  val raw: Boolean = false,
  /** No other request may follow on this connection. */
  val last: Boolean = false
)

/**
 * The one HTTP request parser shared by both paths over the loopback. [framing] is the strict
 * reading of a head (CRLF only, no folding, one Content-Length, chunked as the only coding, Upgrade
 * detected). A connection admitted by the secret gets [authenticatedPlan]: every request head is
 * stripped of the loopback credentials and re-checked for origin. One admitted by a registered
 * signed URL gets [capabilityPlan]: that single request and nothing else.
 */
object NexiRequestRules {
  private val DIGITS = Regex("[0-9]{1,19}")

  private class HeaderScan {
    var length: String? = null
    var coding: String? = null
    var upgrade = false
    var expect = false
    var reason: String? = null
  }

  fun framing(head: String, maxBody: Long): Framing {
    val scan = HeaderScan()
    scan.reason = framingProblem(head)
    for (line in head.split("\r\n").drop(1)) {
      if (scan.reason != null) break
      scan.reason = headerProblem(line)
      if (scan.reason == null) record(scan, line)
    }
    return scan.reason?.let { Framing(it) } ?: lengths(scan, maxBody)
  }

  private fun record(scan: HeaderScan, line: String) {
    val value = line.substringAfter(':').trim().lowercase()
    when (line.substringBefore(':').lowercase()) {
      "content-length" -> {
        if (scan.length != null) scan.reason = "duplicate-content-length"
        scan.length = value
      }
      "transfer-encoding" -> {
        if (scan.coding != null || value != "chunked") scan.reason = "transfer-encoding"
        scan.coding = value
      }
      "upgrade" -> scan.upgrade = true
      "connection" -> scan.upgrade = scan.upgrade || value.split(',').any { it.trim() == "upgrade" }
      "expect" -> scan.expect = true
    }
  }

  private fun lengths(scan: HeaderScan, maxBody: Long): Framing {
    val length = scan.length
    val bytes = length?.takeIf { DIGITS.matches(it) }?.toLongOrNull()
    return when {
      length != null && bytes == null -> Framing("bad-content-length")
      scan.coding != null && length != null -> Framing("ambiguous-length")
      bytes != null && bytes > maxBody -> Framing("body-too-large")
      else -> Framing(null, bytes, scan.coding != null, scan.upgrade, scan.expect)
    }
  }

  private fun framingProblem(head: String): String? {
    val bare = head.indices.any {
      (head[it] == '\n' && (it == 0 || head[it - 1] != '\r')) ||
        (head[it] == '\r' && (it + 1 >= head.length || head[it + 1] != '\n')) ||
        head[it] == '\u0000'
    }
    return if (bare) "bad-framing" else null
  }

  private fun headerProblem(line: String): String? {
    val colon = line.indexOf(':')
    val name = if (colon > 0) line.substring(0, colon) else ""
    return when {
      line.startsWith(" ") || line.startsWith("\t") -> "folded-header"
      colon <= 0 || name != name.trim() || name.any { it.isWhitespace() } -> "bad-header-name"
      else -> null
    }
  }

  /** The plan for every request head on a secret-authenticated connection. */
  fun authenticatedPlan(port: Int): (String) -> RequestPlan = { head ->
    val parsed = NexiLoopbackHead.parse(head, port)
    val framing = framing(head, Long.MAX_VALUE)
    val reason = when {
      NexiCapabilityTargets.requestLine(head) == null -> "bad-request-line"
      parsed.malformed != null -> parsed.malformed
      !NexiLoopbackHead.originAllowed(parsed, port) -> "bad-origin"
      framing.reason != null -> framing.reason
      framing.upgrade && (framing.chunked || (framing.length ?: 0L) > 0L) -> "upgrade-with-body"
      else -> null
    }
    if (reason != null) {
      RequestPlan(reason)
    } else {
      RequestPlan(
        rewrite = NexiLoopbackHead::sanitize,
        length = framing.length ?: 0L,
        chunked = framing.chunked,
        raw = framing.upgrade
      )
    }
  }

  /** The plan for the single request a registered signed URL admits. */
  fun capabilityPlan(
    allowed: (method: String, target: String) -> Boolean,
    limits: LoopbackLimits
  ): (String) -> RequestPlan = { head ->
    val verdict = verify(head, allowed, limits)
    if (verdict.reason != null) {
      RequestPlan(verdict.reason)
    } else {
      RequestPlan(
        rewrite = { closing(NexiLoopbackHead.sanitize(it)) },
        length = verdict.bodyBytes,
        last = true
      )
    }
  }

  fun verify(
    head: String,
    allowed: (method: String, target: String) -> Boolean,
    limits: LoopbackLimits
  ): RequestVerdict {
    val framing = framing(head, limits.maxCapabilityBodyBytes)
    val method = NexiCapabilityTargets.requestLine(head)?.first.orEmpty()
    val reason =
      framing.reason ?: registrationProblem(head, allowed) ?: bodyProblem(framing, method)
    return RequestVerdict(reason, framing.length ?: 0L)
  }

  private fun registrationProblem(
    head: String,
    allowed: (method: String, target: String) -> Boolean
  ): String? {
    val line = NexiCapabilityTargets.requestLine(head)
    val target = line?.let { NexiCapabilityTargets.normalize(it.second) }
    return when {
      line == null -> "bad-request-line"
      line.first !in NexiCapabilityTargets.METHODS -> "method"
      target == null -> "bad-target"
      !allowed(line.first, target) -> "not-registered"
      else -> null
    }
  }

  /** One request, one plain body: no coding, no upgrade, no Expect; a POST sizes its body. */
  private fun bodyProblem(framing: Framing, method: String): String? = when {
    framing.chunked -> "transfer-encoding"
    framing.upgrade -> "upgrade"
    framing.expect -> "expect"
    method == "POST" && framing.length == null -> "length-required"
    method != "POST" && (framing.length ?: 0L) != 0L -> "body-on-read"
    else -> null
  }

  /** The head with every `Connection` header replaced by `Connection: close`. */
  fun closing(head: ByteArray): ByteArray {
    val end = NexiLoopbackHead.headEnd(head)
    val lines = String(head, 0, end, StandardCharsets.ISO_8859_1).split("\r\n")
    val kept = lines.filterIndexed { index, line ->
      index == 0 || !line.substringBefore(':').trim().equals("connection", ignoreCase = true)
    }
    return (kept + "Connection: close").joinToString("\r\n")
      .toByteArray(StandardCharsets.ISO_8859_1) + head.copyOfRange(end, head.size)
  }
}
