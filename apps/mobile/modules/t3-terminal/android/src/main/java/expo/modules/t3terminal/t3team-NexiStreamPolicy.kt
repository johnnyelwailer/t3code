// Fork files use the t3team- prefix, which is not a Kotlin class identifier.
@file:Suppress("ktlint:standard:filename", "MatchingDeclarationName")

package expo.modules.t3terminal

import java.net.URI

/**
 * Where the user's Entra bearer may be sent. `start` receives the stream URL from JS, but the
 * bearer goes to whatever it names, so the native side pins it to the broker origin baked into the
 * build (`pinnedOrigin`, an https origin from the app manifest) and to the one stream path.
 */
object NexiStreamPolicy {
  const val STREAM_PATH = "/v1/client/stream"
  private val SESSION_QUERY = Regex("session=[\\w-]{1,128}")

  /** Null when `streamUrl` may be used, otherwise a fixed refusal message. */
  fun refusal(streamUrl: String, pinnedOrigin: String?): String? {
    val pinned = pinnedOrigin?.let { parse(it) }
    val url = parse(streamUrl)
    return when {
      pinned == null || pinned.scheme != "https" || pinned.rawPath.orEmpty().isNotEmpty() ->
        "The broker origin is not configured in this build"
      url == null || url.scheme != "wss" -> "The broker requires TLS"
      url.rawUserInfo != null || url.rawFragment != null -> "The broker URL is not allowed"
      url.host != pinned.host || url.port != pinned.port ->
        "The broker URL is not the configured broker"
      url.rawPath != STREAM_PATH || !SESSION_QUERY.matches(url.rawQuery.orEmpty()) ->
        "The broker URL is not a client stream"
      else -> null
    }
  }

  private fun parse(value: String): URI? = try {
    URI(value).takeIf { it.host != null }
  } catch (_: java.net.URISyntaxException) {
    null
  }
}
