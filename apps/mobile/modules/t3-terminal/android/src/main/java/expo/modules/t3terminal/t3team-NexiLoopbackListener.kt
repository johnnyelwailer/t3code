// Fork files use the t3team- prefix, which is not a Kotlin class identifier.
@file:Suppress("ktlint:standard:filename", "MatchingDeclarationName")

package expo.modules.t3terminal

import java.io.IOException
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.RejectedExecutionException
import java.util.concurrent.atomic.AtomicBoolean

/** Tunables; the defaults are the production values. */
data class LoopbackLimits(
  val headTimeoutMs: Long = 3_000,
  val maxAuthenticated: Int = 16,
  val maxPending: Int = 16
)

/**
 * Loopback TCP listener that hands a connection to `onAdmitted` only after [NexiLoopbackAuth] admits
 * it. Unauthenticated sockets never reach the broker (no token request, no outbound stream), wait at
 * most `headTimeoutMs`, and do not count against `maxAuthenticated`. At most `maxPending` sockets may
 * be mid-handshake: a newcomer evicts the oldest, so idle floods cannot starve a client that
 * presents its head immediately.
 */
class NexiLoopbackListener(
  private val secret: String,
  private val onAdmitted: (Socket, ByteArray) -> Unit,
  private val securityLog: (String) -> Unit,
  private val onClosed: () -> Unit = {},
  private val limits: LoopbackLimits = LoopbackLimits()
) {
  private val server = ServerSocket(0, 16, InetAddress.getByName("127.0.0.1"))
  private val pending = ArrayDeque<Socket>()
  private val admitted = ConcurrentHashMap.newKeySet<Socket>()
  private val closed = AtomicBoolean(false)
  private val denied = java.util.concurrent.atomic.AtomicInteger()
  private val handshakes = Executors.newCachedThreadPool { task ->
    Thread(task, "nexi-broker-handshake").apply { isDaemon = true }
  }
  val port: Int = server.localPort
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

  fun release(tcp: Socket) {
    admitted.remove(tcp)
    quietly(tcp)
  }

  fun close() {
    if (!closed.compareAndSet(false, true)) return
    quietly(server)
    synchronized(pending) {
      pending.forEach { quietly(it) }
      pending.clear()
    }
    admitted.forEach { quietly(it) }
    admitted.clear()
    handshakes.shutdownNow()
    onClosed()
  }

  private fun beginHandshake(tcp: Socket) {
    synchronized(pending) {
      if (pending.size >= limits.maxPending) quietly(pending.removeFirst())
      pending.addLast(tcp)
    }
    try {
      handshakes.execute { handshake(tcp) }
    } catch (_: RejectedExecutionException) {
      quietly(tcp)
    }
  }

  private fun handshake(tcp: Socket) {
    val admission = NexiLoopbackAuth.admit(tcp, port, secret, limits.headTimeoutMs)
    synchronized(pending) { pending.remove(tcp) }
    if (admission is LoopbackAdmission.Denied) {
      deny(tcp, admission.reason)
      return
    }
    val initial = (admission as LoopbackAdmission.Allowed).initial
    val accepted = synchronized(admitted) {
      val room = admitted.size < limits.maxAuthenticated && !closed.get()
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

  private fun quietly(closeable: java.io.Closeable) {
    try {
      closeable.close()
    } catch (_: IOException) {
      // Already closed.
    }
  }
}
