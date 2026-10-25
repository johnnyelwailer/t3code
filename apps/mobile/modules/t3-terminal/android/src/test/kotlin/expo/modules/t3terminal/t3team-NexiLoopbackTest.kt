// Fork files use the t3team- prefix, which is not a Kotlin class identifier.
@file:Suppress("ktlint:standard:filename", "MatchingDeclarationName")

package expo.modules.t3terminal

import java.net.ConnectException
import java.net.Socket
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import org.junit.After
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

private class Harness(
  headTimeoutMs: Long = 60_000,
  maxAuthenticated: Int = 16,
  maxPending: Int = 16,
  val secret: String = NexiLoopbackAuth.newSecret()
) {
  val admitted = LinkedBlockingQueue<Pair<Socket, ByteArray>>()
  val logs = CopyOnWriteArrayList<String>()
  private val logQueue = LinkedBlockingQueue<String>()
  val closedCount = AtomicInteger()
  val listener = NexiLoopbackListener(
    secret = secret,
    onAdmitted = { tcp, initial -> admitted.add(tcp to initial) },
    securityLog = {
      logs.add(it)
      logQueue.add(it)
    },
    onClosed = { closedCount.incrementAndGet() },
    limits = LoopbackLimits(headTimeoutMs, maxAuthenticated, maxPending),
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

  fun take(): Pair<Socket, ByteArray> =
    admitted.poll(10, TimeUnit.SECONDS) ?: throw AssertionError("connection was not admitted")

  /** Blocks until `count` security events have been logged. */
  fun awaitLogs(count: Int) = repeat(count) {
    logQueue.poll(10, TimeUnit.SECONDS) ?: throw AssertionError("no security event logged")
  }

  fun close() {
    listener.close()
    sockets.forEach { it.close() }
  }
}

class NexiLoopbackTest {
  private val harnesses = mutableListOf<Harness>()
  private fun harness(
    headTimeoutMs: Long = 60_000,
    maxAuthenticated: Int = 16,
    maxPending: Int = 16
  ) = Harness(headTimeoutMs, maxAuthenticated, maxPending).also { harnesses.add(it) }

  @After fun tearDown() = harnesses.forEach { it.close() }

  @Test fun connectionWithoutCredentialIsClosedAndNeverReachesTheBroker() {
    val h = harness()
    val tcp = h.connect()
    tcp.getOutputStream().write(h.request())
    assertTrue(h.isClosedByServer(tcp))
    h.awaitLogs(1)
    assertTrue(h.admitted.isEmpty())
    assertEquals("loopback connection rejected: reason=no-credential total=1", h.logs.single())
  }

  @Test fun wrongSecretIsRejectedEvenWhenOnlyTheLastCharacterDiffers() {
    val h = harness()
    val flipped = h.secret.dropLast(1) + if (h.secret.last() == '0') '1' else '0'
    for (wrong in listOf(flipped, "", h.secret.dropLast(1), h.secret + "0", h.secret.uppercase())) {
      val tcp = h.connect()
      tcp.getOutputStream().write(h.request(h.cookie(wrong)))
      assertTrue(h.isClosedByServer(tcp))
    }
    h.awaitLogs(5)
    assertTrue(h.admitted.isEmpty())
    assertTrue(h.logs.all { "bad-credential" in it || "no-credential" in it })
  }

  @Test fun rightSecretIsAdmittedWithEveryByteReadForForwarding() {
    val h = harness()
    val body = "POST /x HTTP/1.1\r\nHost: a\r\n${h.cookie(
      h.secret
    )}\r\nContent-Length: 2\r\n\r\nhi".toByteArray()
    h.connect().getOutputStream().write(body)
    assertArrayEquals(body, h.take().second)
    assertTrue(h.logs.isEmpty())
  }

  @Test fun explicitHeaderAndCaseInsensitiveCookieNamesWork() {
    val h = harness()
    h.connect().getOutputStream().write(h.request("X-T3-Loopback: ${h.secret}"))
    h.take()
    h.connect().getOutputStream()
      .write(
        h.request(
          "cOOkie: theme=dark; ${NexiLoopbackAuth.cookieName(h.listener.port)}=${h.secret}; a=b=c"
        )
      )
    h.take()
  }

  @Test fun headSplitAcrossManyWritesIsReassembled() {
    val h = harness()
    val out = h.connect().getOutputStream()
    val bytes = h.request(h.cookie(h.secret))
    bytes.toList().chunked(7).forEach {
      out.write(it.toByteArray())
      out.flush()
    }
    assertArrayEquals(bytes, h.take().second)
  }

  @Test fun secretOfAClosedTunnelIsRejectedByItsReplacement() {
    val first = harness()
    val staleSecret = first.secret
    val stalePort = first.listener.port
    first.close()
    assertEquals(1, first.closedCount.get())
    val second = harness()
    assertNotEquals(staleSecret, second.secret)
    for (header in listOf(second.cookie(staleSecret), second.cookie(staleSecret, stalePort))) {
      val tcp = second.connect()
      tcp.getOutputStream().write(second.request(header))
      assertTrue(second.isClosedByServer(tcp))
    }
    assertTrue(second.admitted.isEmpty())
    val dead = try {
      Socket("127.0.0.1", stalePort).close()
      false
    } catch (
      _: ConnectException
    ) {
      true
    }
    assertTrue(dead)
  }

  @Test fun anotherTunnelsSecretIsRejectedEvenWithTheRightCookieName() {
    val a = harness()
    val b = harness()
    val tcp = b.connect()
    tcp.getOutputStream().write(b.request(b.cookie(a.secret)))
    assertTrue(b.isClosedByServer(tcp))
    val crossPort = a.connect()
    crossPort.getOutputStream().write(a.request(a.cookie(a.secret, b.listener.port)))
    assertTrue(a.isClosedByServer(crossPort))
    assertTrue(a.admitted.isEmpty() && b.admitted.isEmpty())
  }

  @Test fun simultaneousAuthenticatedConnectionsAreAllAdmittedUpToTheLimitOfSixteen() {
    val h = harness()
    val clients = (1..16).map {
      h.connect().also { c -> c.getOutputStream().write(h.request(h.cookie(h.secret))) }
    }
    repeat(16) { h.take() }
    val seventeenth = h.connect()
    seventeenth.getOutputStream().write(h.request(h.cookie(h.secret)))
    assertTrue(h.isClosedByServer(seventeenth))
    assertTrue(h.admitted.isEmpty())
    h.awaitLogs(1)
    assertTrue(h.logs.single().contains("connection-limit"))
    assertEquals(16, clients.size)
  }

  @Test fun releasingAnAuthenticatedConnectionFreesItsSlot() {
    val h = harness(maxAuthenticated = 1)
    h.connect().getOutputStream().write(h.request(h.cookie(h.secret)))
    val (first, _) = h.take()
    h.listener.release(first)
    h.connect().getOutputStream().write(h.request(h.cookie(h.secret)))
    h.take()
  }

  @Test fun floodOfUnauthenticatedConnectionsCannotStarveLegitimateOnes() {
    val h = harness(maxAuthenticated = 2, maxPending = 4)
    // Never send a head: backlog order is FIFO, so each is evicted by its successors.
    val idle = (1..24).map { h.connect() }
    val legit = h.connect()
    legit.getOutputStream().write(h.request(h.cookie(h.secret)))
    h.take()
    val second = h.connect()
    second.getOutputStream().write(h.request(h.cookie(h.secret)))
    h.take()
    // The oldest idle sockets were evicted, and none of them counted against the authenticated limit
    // (two authenticated connections fit with maxAuthenticated = 2).
    assertTrue(h.isClosedByServer(idle.first()))
    assertTrue(h.admitted.isEmpty())
  }

  @Test fun idleConnectionIsDroppedAfterTheHeadTimeoutAndLoggedWithoutContent() {
    val h = harness(headTimeoutMs = 50)
    val idle = h.connect()
    assertTrue(h.isClosedByServer(idle))
    h.awaitLogs(1)
    assertTrue(h.logs.single().contains("head-timeout"))
    assertTrue(h.admitted.isEmpty())
  }

  @Test fun oversizedHeadAndEarlyDisconnectAreRejected() {
    val h = harness()
    val big = h.connect()
    big.getOutputStream().write(
      ByteArray(NexiLoopbackAuth.MAX_HEAD_BYTES + 4096) {
        'a'.code.toByte()
      }
    )
    assertTrue(h.isClosedByServer(big))
    h.connect().close()
    h.awaitLogs(2)
    assertTrue(h.logs.any { "closed-before-head" in it })
    assertTrue(h.logs.any { "head-too-large" in it })
    assertTrue(h.admitted.isEmpty())
  }

  @Test fun secretsNeverAppearInLogs() {
    val h = harness(maxAuthenticated = 1)
    val wrong = NexiLoopbackAuth.newSecret()
    val attempts = listOf(h.cookie(wrong), "X-T3-Loopback: $wrong", h.cookie(h.secret.dropLast(2)))
    for (header in attempts) {
      val tcp = h.connect()
      tcp.getOutputStream().write(h.request(header))
      assertTrue(h.isClosedByServer(tcp))
    }
    h.connect().getOutputStream().write(h.request(h.cookie(h.secret)))
    h.take()
    val over = h.connect() // second authenticated connection hits the limit
    over.getOutputStream().write(h.request(h.cookie(h.secret)))
    assertTrue(h.isClosedByServer(over))
    h.awaitLogs(4)
    val joined = h.logs.joinToString("\n")
    for (secret in listOf(h.secret, wrong, h.secret.dropLast(2))) assertFalse(secret in joined)
  }

  @Test fun closingTheListenerClosesAdmittedSocketsOnceAndRefusesNewOnes() {
    val h = harness()
    h.connect().getOutputStream().write(h.request(h.cookie(h.secret)))
    val (admitted, _) = h.take()
    val port = h.listener.port
    h.listener.close()
    h.listener.close()
    assertEquals(1, h.closedCount.get())
    assertTrue(admitted.isClosed)
    val refused = try {
      Socket("127.0.0.1", port).close()
      false
    } catch (
      _: ConnectException
    ) {
      true
    }
    assertTrue(refused)
  }

  @Test fun secretIsLongRandomHexAndCookieSafe() {
    val secrets = (1..50).map { NexiLoopbackAuth.newSecret() }
    assertEquals(50, secrets.toSet().size)
    assertTrue(secrets.all { it.length == 64 && it.matches(Regex("[0-9a-f]{64}")) })
    assertEquals("t3lb54321", NexiLoopbackAuth.cookieName(54321))
  }

  @Test fun comparisonIsExactForEveryDifferenceShape() {
    val s = NexiLoopbackAuth.newSecret()
    assertTrue(NexiLoopbackAuth.matches(s, s))
    assertTrue(NexiLoopbackAuth.matches(s, String(s.toCharArray())))
    for (other in listOf("", s.take(1), s.dropLast(1), "$s ", s.reversed(), "x".repeat(4096))) {
      assertFalse(NexiLoopbackAuth.matches(s, other))
    }
    assertFalse(NexiLoopbackAuth.matches("", "a"))
  }

  @Test fun credentialsAreOnlyReadFromTheHeadOfTheRightPort() {
    val head = "GET / HTTP/1.1\r\nCookie: t3lb1=aa; t3lb2=bb; t3lb22=cc\r\nx-t3-loopback: dd\r\n" +
      "X-Other: t3lb2=ee"
    assertEquals(listOf("dd", "bb").sorted(), NexiLoopbackAuth.presented(head, 2).sorted())
    assertEquals(listOf("cc", "dd"), NexiLoopbackAuth.presented(head, 22).sorted())
    assertEquals(listOf("dd"), NexiLoopbackAuth.presented(head, 9))
    // The request line is never a credential source.
    assertEquals(emptyList<String>(), NexiLoopbackAuth.presented("GET /t3lb2=ff HTTP/1.1", 2))
  }

  @Test fun registryReusesALiveTunnelAndReplacesADeadOneWithANewSecret() {
    class Fake(val harness: Harness)
    val registry = NexiTunnelRegistry<Fake> { it.harness.listener.isClosed }
    val first = registry.acquire("h-1") { Fake(harness()) }
    assertTrue(first.fresh)
    val reused = registry.acquire("h-1") { throw AssertionError("must reuse") }
    assertFalse(reused.fresh)
    assertEquals(first.tunnel, reused.tunnel)
    assertEquals(first.tunnel.harness.listener.port, reused.tunnel.harness.listener.port)
    // Backgrounded and the socket was reclaimed: the next start builds a new tunnel and secret.
    first.tunnel.harness.listener.close()
    val replaced = registry.acquire("h-1") { Fake(harness()) }
    assertTrue(replaced.fresh)
    assertNotEquals(first.tunnel.harness.secret, replaced.tunnel.harness.secret)
    val other = registry.acquire("h-2") { Fake(harness()) }
    assertNotEquals(replaced.tunnel.harness.secret, other.tunnel.harness.secret)
    assertEquals(2, registry.drain().size)
    assertNull(registry.drain().firstOrNull())
    assertNotNull(registry.acquire("h-1") { Fake(harness()) })
  }
}
