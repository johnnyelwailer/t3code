// Fork files use the t3team- prefix, which is not a Kotlin class identifier.
@file:Suppress("ktlint:standard:filename", "MatchingDeclarationName")

package expo.modules.t3terminal

import java.io.Closeable
import java.io.IOException
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.RejectedExecutionException
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger

/** Tunables; the defaults are the production values. */
data class LoopbackLimits(
  val headTimeoutMs: Long = 3_000,
  /** A socket that has sent nothing by now is dropped. */
  val firstByteMs: Long = 500,
  /** A full pending queue only evicts silent sockets at least this old. */
  val minEvictAgeMs: Long = 250,
  val maxAuthenticated: Int = 16,
  val maxPending: Int = 32,
  /** How long a registered signed URL admits connections, and how many are kept. */
  val capabilityTtlMs: Long = 60 * 60_000,
  val maxCapabilities: Int = 512,
  val nanoTime: () -> Long = System::nanoTime,
  /** Test seam: called when a pending socket's first byte has been read. */
  val onFirstByte: () -> Unit = {},
  /** Test seam: runs inside the lock that admits a socket, before it is added. */
  val insideAdmitLock: () -> Unit = {}
)

private class Pending(val tcp: Socket, val acceptedAt: Long) {
  @Volatile var sawByte = false
}

/**
 * Loopback TCP listener that hands a connection to `onAdmitted` only after [NexiLoopbackAuth] admits
 * it. Unauthenticated sockets never reach the broker (no token request, no outbound stream), wait at
 * most `firstByteMs` for a first byte and `headTimeoutMs` for the whole head, and do not count
 * against `maxAuthenticated`. At most `maxPending` sockets may be mid-handshake. When full, a
 * newcomer evicts the oldest socket that has sent nothing and is at least `minEvictAgeMs` old; with
 * none, the newcomer is refused. A socket that is sending, or is young, is never evicted, so a
 * flood cannot knock out a legitimate client that is mid-handshake.
 */
class NexiLoopbackListener(
  private val secret: String,
  private val onAdmitted: (Socket, ByteArray) -> Unit,
  private val securityLog: (String) -> Unit,
  private val onClosed: () -> Unit = {},
  private val limits: LoopbackLimits = LoopbackLimits()
) {
  private val server = ServerSocket(0, 16, InetAddress.getByName("127.0.0.1"))
  private val pending = ArrayDeque<Pending>()
  private val admitted = ConcurrentHashMap.newKeySet<Socket>()
  private val closed = AtomicBoolean(false)
  private val denied = AtomicInteger()
  private val capabilities = LinkedHashMap<String, Long>()
  private val handshakes = Executors.newCachedThreadPool { task ->
    Thread(task, "nexi-broker-handshake").apply { isDaemon = true }
  }
  val port: Int = server.localPort
  private val credentials = LoopbackCredentials(port, secret, ::isCapable)
  val isClosed: Boolean get() = closed.get()

  fun start() {
    // A dedicated accept thread never consumes a worker needed by an active stream.
    Thread({
      try {
        while (!server.isClosed) beginHandshake(server.accept())
      } catch (_: IOException) {
        // The listener is gone either way; close() reports it.
      }
      close()
    }, "nexi-broker-accept").apply { isDaemon = true }.start()
  }

  /** Registers a signed URL on this tunnel; false for any other URL or a closed listener. */
  fun allowUrl(url: String): Boolean =
    NexiCapabilityTargets.targetFor(url, port)?.let { allowTarget(it) } ?: false

  fun allowTarget(rawTarget: String): Boolean {
    val target = NexiCapabilityTargets.normalize(rawTarget)
    if (target == null || closed.get()) return false
    synchronized(capabilities) {
      capabilities.remove(target)
      capabilities[target] = limits.nanoTime() + limits.capabilityTtlMs * 1_000_000
      while (capabilities.size > limits.maxCapabilities) {
        capabilities.remove(capabilities.keys.first())
      }
    }
    return true
  }

  private fun isCapable(method: String, target: String): Boolean = synchronized(capabilities) {
    val expiresAt = capabilities[target]
    val live = method in NexiCapabilityTargets.METHODS && expiresAt != null &&
      expiresAt > limits.nanoTime()
    if (expiresAt != null && !live) capabilities.remove(target)
    live
  }

  fun release(tcp: Socket) {
    admitted.remove(tcp)
    quietly(tcp)
  }

  fun close() {
    if (!closed.compareAndSet(false, true)) return
    quietly(server)
    synchronized(pending) {
      pending.forEach { quietly(it.tcp) }
      pending.clear()
    }
    // The same lock `handshake` admits under, so no socket is admitted after this point.
    synchronized(admitted) {
      admitted.forEach { quietly(it) }
      admitted.clear()
    }
    synchronized(capabilities) { capabilities.clear() }
    handshakes.shutdownNow()
    onClosed()
  }

  private fun beginHandshake(tcp: Socket) {
    val entry = Pending(tcp, limits.nanoTime())
    val refused = synchronized(pending) {
      val room = pending.size < limits.maxPending || evictOldestSilent()
      if (room) pending.addLast(entry)
      !room
    }
    if (refused) {
      deny(tcp, "pending-full")
      return
    }
    try {
      handshakes.execute { handshake(entry) }
    } catch (_: RejectedExecutionException) {
      quietly(tcp)
    }
  }

  /** Caller holds the `pending` lock. */
  private fun evictOldestSilent(): Boolean {
    val cutoff = limits.nanoTime() - limits.minEvictAgeMs * 1_000_000
    val victim = pending.firstOrNull { !it.sawByte && it.acceptedAt <= cutoff }
    victim?.let {
      pending.remove(it)
      quietly(it.tcp)
    }
    return victim != null
  }

  private fun handshake(entry: Pending) {
    val tcp = entry.tcp
    val admission = NexiLoopbackAuth.admit(tcp, credentials, limits) {
      entry.sawByte = true
      limits.onFirstByte()
    }
    synchronized(pending) { pending.remove(entry) }
    if (admission is LoopbackAdmission.Denied) {
      deny(tcp, admission.reason)
      return
    }
    val initial = (admission as LoopbackAdmission.Allowed).initial
    val accepted = synchronized(admitted) {
      val room = admitted.size < limits.maxAuthenticated && !closed.get()
      limits.insideAdmitLock()
      if (room) admitted.add(tcp)
      room
    }
    if (!accepted) {
      deny(tcp, "connection-limit")
      return
    }
    try {
      onAdmitted(tcp, initial)
    } catch (_: RuntimeException) {
      release(tcp)
    }
  }

  /** The reason is a fixed token: the presented credential is never logged. */
  private fun deny(tcp: Socket, reason: String) {
    quietly(tcp)
    val count = denied.incrementAndGet()
    if (count <= 5 || count % 100 == 0) {
      securityLog("loopback connection rejected: reason=$reason total=$count")
    }
  }

  private fun quietly(closeable: Closeable) {
    try {
      closeable.close()
    } catch (_: IOException) {
      // Already closed.
    }
  }
}
