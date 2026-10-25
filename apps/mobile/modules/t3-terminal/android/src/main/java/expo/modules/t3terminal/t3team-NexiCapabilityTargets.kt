// Fork files use the t3team- prefix, which is not a Kotlin class identifier.
@file:Suppress("ktlint:standard:filename", "MatchingDeclarationName")

package expo.modules.t3terminal

import java.net.URI
import java.net.URISyntaxException

/**
 * Native HTTP clients (Expo's downloader and uploader, Coil, ExoPlayer, the chip icon loader) take a
 * bare URL and cannot send the loopback cookie. The app registers each signed URL it hands them as a
 * capability: the exact request target, carrying the host's own unguessable token, admits a
 * connection whose first request is that target. A local app that does not already hold the URL
 * cannot name a registered target, so admission is not widened to "any local app".
 */
object NexiCapabilityTargets {
  /** Reads and the signed upload; nothing that changes or tunnels. Methods are case sensitive. */
  val METHODS = setOf("GET", "HEAD", "POST")
  private val ESCAPE = Regex("%[0-9a-fA-F]{2}")

  /** Origin-form request target, escapes upper-cased; null for anything else (absolute form, `*`). */
  fun normalize(rawTarget: String): String? {
    val originForm = rawTarget.startsWith("/") && !rawTarget.startsWith("//")
    val uri = if (originForm) parse("http://127.0.0.1$rawTarget") else null
    return if (uri == null || uri.rawAuthority != "127.0.0.1" || uri.rawFragment != null) {
      null
    } else {
      val path = uri.rawPath.orEmpty().ifEmpty { "/" }
      ESCAPE.replace(uri.rawQuery?.let { "$path?$it" } ?: path) { it.value.uppercase() }
    }
  }

  /** The target of a URL on this tunnel's own loopback port, or null (fragment dropped). */
  fun targetFor(url: String, port: Int): String? {
    val uri = parse(url)
    val path = uri?.rawPath.orEmpty()
    val query = uri?.rawQuery
    val onTunnel = uri != null && uri.scheme == "http" && uri.host == "127.0.0.1" &&
      uri.port == port && uri.rawUserInfo == null
    return if (!onTunnel || path.isEmpty() || path == "/") {
      null
    } else {
      normalize(query?.let { "$path?$it" } ?: path)
    }
  }

  private fun parse(value: String): URI? = try {
    URI(value)
  } catch (_: URISyntaxException) {
    null
  }

  /** `method` and `target` from the request line, or null when it is not `M /target HTTP/1.x`. */
  fun requestLine(head: String): Pair<String, String>? {
    val parts = head.substringBefore("\r\n").split(' ')
    val valid = parts.size == 3 && parts[2].startsWith("HTTP/1.")
    return if (valid) parts[0] to parts[1] else null
  }
}
