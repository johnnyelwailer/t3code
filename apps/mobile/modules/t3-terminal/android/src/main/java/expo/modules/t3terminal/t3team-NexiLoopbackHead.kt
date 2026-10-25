// Fork files use the t3team- prefix, which is not a Kotlin class identifier.
@file:Suppress("ktlint:standard:filename", "MatchingDeclarationName")

package expo.modules.t3terminal

import java.nio.charset.StandardCharsets

/** What the first request head presents. `malformed` is a fixed reason token, never content. */
class ParsedHead(
  val credentials: List<String>,
  val origin: String?,
  val fetchSite: String?,
  val malformed: String?
)

/**
 * String-level handling of the first HTTP request head: reading the credential, refusing
 * ambiguous heads, the cross-origin checks, and removing the credential before the head is forwarded.
 */
object NexiLoopbackHead {
  const val CREDENTIAL_HEADER = "x-t3-loopback"
  const val COOKIE_PREFIX = "t3lb"
  private val HEAD_END = byteArrayOf(13, 10, 13, 10)
  private val SINGLETONS = setOf("cookie", "origin", "sec-fetch-site")

  fun cookieName(port: Int) = "$COOKIE_PREFIX$port"

  /** Index of the blank line ending the head, or -1 while the head is incomplete. */
  fun headEnd(bytes: ByteArray): Int {
    for (start in 0..bytes.size - HEAD_END.size) {
      if (HEAD_END.indices.all { bytes[start + it] == HEAD_END[it] }) return start
    }
    return -1
  }

  /**
   * Header lines that start with whitespace (obsolete folding) and repeated Cookie, Origin or
   * Sec-Fetch-Site headers are ambiguous for a parser that sits in front of the real one: refused.
   */
  fun parse(head: String, port: Int): ParsedHead {
    val credentials = mutableListOf<String>()
    val singles = mutableMapOf<String, String>()
    var malformed: String? = null
    for (line in head.split("\r\n").drop(1)) {
      val colon = line.indexOf(':')
      if (line.startsWith(" ") || line.startsWith("\t")) {
        malformed = malformed ?: "folded-header"
      } else if (colon > 0) {
        val name = line.substring(0, colon).trim().lowercase()
        val value = line.substring(colon + 1).trim()
        if (name == CREDENTIAL_HEADER) credentials += value
        if (name in SINGLETONS && singles.put(name, value) != null) {
          malformed = malformed ?: "duplicate-$name"
        }
      }
    }
    singles["cookie"]?.let { credentials += cookieValues(it, cookieName(port)) }
    return ParsedHead(credentials, singles["origin"], singles["sec-fetch-site"], malformed)
  }

  /**
   * Cookies are not port-scoped, so a page served by another tunnel (same site, other port) could
   * send this one's cookie. React Native's WebSocket sends exactly this port's origin and its fetch
   * sends none; a same-origin document sends this port's origin. Any other Origin, `null` included,
   * or a Sec-Fetch-Site other than same-origin/none, is refused.
   */
  fun originAllowed(parsed: ParsedHead, port: Int): Boolean =
    (parsed.origin == null || parsed.origin == "http://127.0.0.1:$port") &&
      (parsed.fetchSite == null || parsed.fetchSite == "same-origin" || parsed.fetchSite == "none")

  /** The head with every loopback credential removed; any bytes after the head are untouched. */
  fun sanitize(bytes: ByteArray): ByteArray {
    val end = headEnd(bytes)
    if (end < 0) return bytes
    val lines = String(bytes, 0, end, StandardCharsets.ISO_8859_1).split("\r\n")
    val kept = lines.withIndex().mapNotNull { (index, line) ->
      if (index ==
        0
      ) {
        line
      } else {
        scrub(line)
      }
    }
    return kept.joinToString("\r\n").toByteArray(StandardCharsets.ISO_8859_1) +
      bytes.copyOfRange(end, bytes.size)
  }

  /** Names of leftover `t3lb*` cookies in a `CookieManager.getCookie` result. */
  fun staleCookieNames(cookieHeader: String?): List<String> = cookieHeader.orEmpty().split(';')
    .map { it.trim().substringBefore('=') }
    .filter { it.startsWith(COOKIE_PREFIX) }

  private fun scrub(line: String): String? {
    val colon = line.indexOf(':')
    val name = if (colon > 0) line.substring(0, colon).trim().lowercase() else ""
    val kept = if (name == "cookie") {
      line.substring(colon + 1).split(';').map { it.trim() }
        .filter { it.isNotEmpty() && !it.startsWith(COOKIE_PREFIX) }
    } else {
      null
    }
    return when {
      name == CREDENTIAL_HEADER -> null
      kept == null -> line
      kept.isEmpty() -> null
      else -> line.substring(0, colon) + ": " + kept.joinToString("; ")
    }
  }

  private fun cookieValues(header: String, name: String) = header.split(';')
    .map { it.trim() }
    .filter { it.contains('=') && it.substringBefore('=') == name }
    .map { it.substringAfter('=') }
}
