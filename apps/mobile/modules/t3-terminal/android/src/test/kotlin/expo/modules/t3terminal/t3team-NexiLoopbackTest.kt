// Fork files use the t3team- prefix, which is not a Kotlin class identifier.
@file:Suppress("ktlint:standard:filename", "MatchingDeclarationName")

package expo.modules.t3terminal

import java.net.ConnectException
import java.net.Socket
import java.util.concurrent.CountDownLatch
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class NexiLoopbackTest {
  private val harnesses = mutableListOf<Harness>()
  private fun harness(limits: LoopbackLimits = PATIENT) = Harness(limits).also { harnesses.add(it) }

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

  @Test fun rightSecretIsAdmittedAndForwardedWithoutTheCredentialButWithEveryOtherByte() {
    val h = harness()
    val cookie = h.cookie(h.secret)
    val body = "POST /x HTTP/1.1\r\nHost: a\r\n$cookie; theme=dark\r\nContent-Length: 2\r\n\r\nhi"
    h.connect().getOutputStream().write(body.toByteArray())
    val forwarded = String(h.take().second, Charsets.ISO_8859_1)
    assertEquals(
      "POST /x HTTP/1.1\r\nHost: a\r\nCookie: theme=dark\r\nContent-Length: 2\r\n\r\nhi",
      forwarded
    )
    assertFalse(h.secret in forwarded)
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
    assertEquals(String(h.request()), String(h.take().second))
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
    val h = harness(PATIENT.copy(maxAuthenticated = 1))
    h.connect().getOutputStream().write(h.request(h.cookie(h.secret)))
    val (first, _) = h.take()
    h.listener.release(first)
    h.connect().getOutputStream().write(h.request(h.cookie(h.secret)))
    h.take()
  }

  @Test fun silentConnectionIsDroppedAtTheFirstByteDeadline() {
    val h = harness(PATIENT.copy(firstByteMs = 50))
    assertTrue(h.isClosedByServer(h.connect()))
    h.awaitLogs(1)
    assertTrue(h.logs.single().contains("first-byte-timeout"))
    assertTrue(h.admitted.isEmpty())
  }

  @Test fun clientThatStallsMidHeadIsDroppedAtTheHeadDeadline() {
    val h = harness(PATIENT.copy(headTimeoutMs = 200))
    val tcp = h.connect()
    tcp.getOutputStream().write("GET / HTTP/1.1\r\n".toByteArray())
    assertTrue(h.isClosedByServer(tcp))
    h.awaitLogs(1)
    assertTrue(h.logs.single().contains("head-timeout"))
  }

  @Test fun foreignOriginsAreRefusedEvenWithTheRightSecret() {
    val h = harness()
    val port = h.listener.port
    val refused = listOf(
      "Origin: http://127.0.0.1:${port + 1}",
      "Origin: null",
      "Origin: https://localhost",
      "Origin: http://localhost:$port",
      "Origin: https://127.0.0.1:$port",
      "Sec-Fetch-Site: cross-site",
      "Sec-Fetch-Site: same-site"
    )
    for (extra in refused) {
      val tcp = h.connect()
      tcp.getOutputStream().write(h.request(h.cookie(h.secret), extra))
      assertTrue(extra, h.isClosedByServer(tcp))
    }
    assertTrue(h.admitted.isEmpty())
    h.awaitLogs(5)
    assertTrue(h.logs.all { "bad-origin" in it })
  }

  @Test fun ownOriginAndNoOriginAreAdmitted() {
    val h = harness()
    val port = h.listener.port
    for (extra in listOf(
      "Origin: http://127.0.0.1:$port",
      "Sec-Fetch-Site: same-origin",
      "Sec-Fetch-Site: none",
      "Accept: */*"
    )) {
      h.connect().getOutputStream().write(h.request(h.cookie(h.secret), extra))
      h.take()
    }
  }

  @Test fun ambiguousHeadsAreRefusedEvenWithTheRightSecret() {
    val h = harness()
    val cookie = h.cookie(h.secret)
    val heads = listOf(
      h.request(cookie, " folded: continuation"),
      h.request(cookie, "\tfolded: continuation"),
      h.request(cookie, "Cookie: other=1"),
      h.request(cookie, "Origin: http://127.0.0.1:${h.listener.port}", "origin: http://x")
    )
    for (head in heads) {
      val tcp = h.connect()
      tcp.getOutputStream().write(head)
      assertTrue(h.isClosedByServer(tcp))
    }
    assertTrue(h.admitted.isEmpty())
    h.awaitLogs(4)
    assertEquals(
      listOf("folded-header", "folded-header", "duplicate-cookie", "duplicate-origin"),
      h.logs.map { it.substringAfter("reason=").substringBefore(" ") }
    )
  }

  @Test fun closeWaitsForAHandshakeThatIsAdmittingSoNoSocketIsAdmittedAfterIt() {
    val inside = CountDownLatch(1)
    val proceed = CountDownLatch(1)
    val limits = PATIENT.copy(
      insideAdmitLock = {
        inside.countDown()
        proceed.await()
      }
    )
    val h = harness(limits)
    val client = h.connect()
    client.getOutputStream().write(h.request(h.cookie(h.secret)))
    // The handshake has decided "room" and holds the admit lock, but has not added the socket.
    assertTrue(inside.await(10, TimeUnit.SECONDS))
    val closing = Thread { h.listener.close() }.apply { start() }
    // close() must be waiting for that lock; a close that does not take it finishes here and the
    // socket is then added to a listener that is already closed.
    closing.join(500)
    proceed.countDown()
    closing.join(10_000)
    assertTrue(h.isClosedByServer(client))
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
    val h = harness(PATIENT.copy(maxAuthenticated = 1))
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
