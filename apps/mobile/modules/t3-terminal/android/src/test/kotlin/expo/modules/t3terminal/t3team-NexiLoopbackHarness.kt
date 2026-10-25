// Fork files use the t3team- prefix, which is not a Kotlin class identifier.
@file:Suppress("ktlint:standard:filename", "MatchingDeclarationName")

package expo.modules.t3terminal

import java.io.InputStream
import java.net.Socket
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

/** Idle sockets stay pending for a minute unless a test lowers a deadline. */
val PATIENT = LoopbackLimits(headTimeoutMs = 60_000, firstByteMs = 60_000)

class Harness(
  limits: LoopbackLimits = PATIENT,
  val secret: String = NexiLoopbackAuth.newSecret(),
  revocations: CapabilityRevocations = CapabilityRevocations()
) {
  val admitted = LinkedBlockingQueue<Pair<Socket, InputStream>>()
  val logs = CopyOnWriteArrayList<String>()
  private val logQueue = LinkedBlockingQueue<String>()
  val closedCount = AtomicInteger()
  val listener = NexiLoopbackListener(
    secret = secret,
    onAdmitted = { tcp, input -> admitted.add(tcp to input) },
    securityLog = {
      logs.add(it)
      logQueue.add(it)
    },
    onClosed = { closedCount.incrementAndGet() },
    limits = limits,
    revocations = revocations
  ).also { it.start() }
  private val sockets = CopyOnWriteArrayList<Socket>()

  fun connect(port: Int = listener.port): Socket =
    Socket("127.0.0.1", port).also {
      it.soTimeout = 10_000
      sockets.add(it)
    }

  fun request(vararg headers: String): ByteArray {
    val lines = listOf("GET /.well-known/t3/environment HTTP/1.1", "Host: 127.0.0.1") + headers
    return (lines.joinToString("\r\n") + "\r\n\r\n").toByteArray()
  }

  fun cookie(value: String, port: Int = listener.port) = "Cookie: ${NexiLoopbackAuth.cookieName(
    port
  )}=$value"

  /** True once the server side has closed the connection (blocks until it does). */
  fun isClosedByServer(tcp: Socket) = try {
    tcp.getInputStream().read() == -1
  } catch (_: java.net.SocketException) {
    true
  }

  fun takeStream(): Pair<Socket, InputStream> {
    val admission = admitted.poll(10, TimeUnit.SECONDS)
      ?: throw AssertionError("connection was not admitted")
    // A read that the listener should have refused must fail fast rather than wait for more bytes.
    admission.first.soTimeout = 5_000
    return admission
  }

  /** The first bytes the listener would forward to the host (one read, as the pipe does). */
  fun take(): Pair<Socket, ByteArray> {
    val (tcp, input) = takeStream()
    val buffer = ByteArray(64 * 1024)
    return tcp to buffer.copyOf(input.read(buffer))
  }

  /** Blocks until `count` security events have been logged. */
  fun awaitLogs(count: Int) = repeat(count) {
    logQueue.poll(10, TimeUnit.SECONDS) ?: throw AssertionError("no security event logged")
  }

  fun close() {
    listener.close()
    sockets.forEach { it.close() }
  }
}
