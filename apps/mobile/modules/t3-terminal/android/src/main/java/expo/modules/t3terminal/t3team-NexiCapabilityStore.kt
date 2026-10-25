// Fork files use the t3team- prefix, which is not a Kotlin class identifier.
@file:Suppress("ktlint:standard:filename", "MatchingDeclarationName")

package expo.modules.t3terminal

/**
 * Registrations that left a tunnel when it closed or was replaced, shared by all tunnels of the
 * module. A signed URL another app captured by binding the dead tunnel's port must not be admitted
 * by the replacement: it stays refused until it expires (or the app mints a new one).
 */
class CapabilityRevocations(private val max: Int = 4096) {
  private val revoked = LinkedHashMap<String, Long>()

  @Synchronized
  fun add(entries: Map<String, Long>) {
    entries.forEach {
      revoked.remove(it.key)
      revoked[it.key] = it.value
    }
    while (revoked.size > max) revoked.remove(revoked.keys.first())
  }

  @Synchronized
  fun isRevoked(key: String, now: Long): Boolean {
    val expiresAt = revoked[key]
    if (expiresAt != null && expiresAt <= now) revoked.remove(key)
    return expiresAt != null && expiresAt > now
  }
}

/**
 * One tunnel's registered signed URLs, each bound to a method: a GET asset URL does not admit a
 * POST, and the signed upload URL does not admit a GET. Entries expire by the injected clock (on
 * Android the elapsed-realtime clock, which keeps counting in deep sleep) and are bounded.
 */
class CapabilityStore(
  private val limits: LoopbackLimits,
  private val revocations: CapabilityRevocations
) {
  private val entries = LinkedHashMap<String, Long>()

  private fun key(method: String, target: String) = "$method $target"

  /** False when a replaced tunnel already held this URL: it is not admitted again. */
  @Synchronized
  fun allow(methods: Set<String>, target: String): Boolean {
    val now = limits.nanoTime()
    val refused = methods.any { revocations.isRevoked(key(it, target), now) }
    if (!refused) {
      methods.forEach {
        entries.remove(key(it, target))
        entries[key(it, target)] = now + limits.capabilityTtlMs * 1_000_000
      }
      while (entries.size > limits.maxCapabilities) entries.remove(entries.keys.first())
    }
    return !refused
  }

  @Synchronized
  fun admits(method: String, target: String): Boolean {
    val expiresAt = entries[key(method, target)]
    val live = expiresAt != null && expiresAt > limits.nanoTime()
    if (expiresAt != null && !live) entries.remove(key(method, target))
    return live
  }

  /** Called when the tunnel closes: its registrations move to the shared revocations. */
  @Synchronized
  fun revokeAll() {
    revocations.add(entries.toMap())
    entries.clear()
  }
}
