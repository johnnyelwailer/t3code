// Fork files use the t3team- prefix, which is not a Kotlin class identifier.
@file:Suppress("ktlint:standard:filename", "MatchingDeclarationName")

package expo.modules.t3terminal

/**
 * One tunnel's registered signed URLs, each bound to a method: a GET asset URL does not admit a
 * POST, and the signed upload URL does not admit a GET. Every key carries `tunnelId`, a random
 * identity of this tunnel instance (not its port, which the OS may hand to a successor), and the
 * store belongs to one listener, so nothing registered on a closed or replaced tunnel is valid on
 * its successor: the app registers the URL it wants on the tunnel it is using, and only then.
 * Registering the same URL again (the host mints identical targets within a signing bucket) is an
 * ordinary renewal. Entries expire by the injected clock (on Android the elapsed-realtime clock,
 * which keeps counting in deep sleep) and are bounded.
 */
class CapabilityStore(private val limits: LoopbackLimits, private val tunnelId: String) {
  private val entries = LinkedHashMap<String, Long>()

  private fun key(method: String, target: String) = "$tunnelId $method $target"

  @Synchronized
  fun allow(methods: Set<String>, target: String) {
    val expiresAt = limits.nanoTime() + limits.capabilityTtlMs * 1_000_000
    methods.forEach {
      entries.remove(key(it, target))
      entries[key(it, target)] = expiresAt
    }
    while (entries.size > limits.maxCapabilities) entries.remove(entries.keys.first())
  }

  @Synchronized
  fun admits(method: String, target: String): Boolean {
    val expiresAt = entries[key(method, target)]
    val live = expiresAt != null && expiresAt > limits.nanoTime()
    if (expiresAt != null && !live) entries.remove(key(method, target))
    return live
  }

  /** Called when the tunnel closes: its registrations die with it. */
  @Synchronized
  fun clear() = entries.clear()
}
