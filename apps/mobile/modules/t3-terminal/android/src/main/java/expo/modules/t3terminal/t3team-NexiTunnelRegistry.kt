// Fork files use the t3team- prefix, which is not a Kotlin class identifier.
@file:Suppress("ktlint:standard:filename", "MatchingDeclarationName")

package expo.modules.t3terminal

import java.util.concurrent.ConcurrentHashMap

/** A tunnel handed out by the registry; `fresh` is true when it was just created. */
class AcquiredTunnel<T : Any>(val tunnel: T, val fresh: Boolean)

/**
 * One tunnel per broker session. A tunnel whose listener died (the accept loop failed, or the OS
 * reclaimed the socket while the app was backgrounded) is replaced rather than reused: the
 * replacement is built by `create`, so it carries its own new secret and nothing minted for the dead
 * tunnel is accepted again.
 */
class NexiTunnelRegistry<T : Any>(private val isClosed: (T) -> Boolean) {
  private val tunnels = ConcurrentHashMap<String, T>()

  @Synchronized
  fun acquire(session: String, create: () -> T): AcquiredTunnel<T> {
    tunnels[session]?.takeIf { !isClosed(it) }?.let { return AcquiredTunnel(it, false) }
    return AcquiredTunnel(create().also { tunnels[session] = it }, true)
  }

  fun remove(session: String, tunnel: T) = tunnels.remove(session, tunnel)

  @Synchronized
  fun drain(): List<T> = tunnels.values.toList().also { tunnels.clear() }
}
