// Fork files use the t3team- prefix, which is not a Kotlin class identifier.
@file:Suppress("ktlint:standard:filename", "MatchingDeclarationName")

package expo.modules.t3terminal

import java.net.Socket
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Semaphore
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicLong
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** Pending-queue behaviour under an idle-connection flood, on a controllable clock. */
class NexiLoopbackFloodTest {
  private val harnesses = mutableListOf<Harness>()
  private val floodSockets = CopyOnWriteArrayList<Socket>()
  private val now = AtomicLong(1_000_000_000L)
  private val accepted = Semaphore(0)
  private val firstBytes = Semaphore(0)

  /** Every accepted socket reads the clock (a full queue reads it again): wait for "at least". */
  private val clock = {
    accepted.release()
    now.get()
  }

  private fun harness(limits: LoopbackLimits) = Harness(limits).also { harnesses.add(it) }

  private fun awaitAccepted(count: Int) =
    assertTrue(accepted.tryAcquire(count, 10, TimeUnit.SECONDS))

  @After fun tearDown() {
    harnesses.forEach { it.close() }
    floodSockets.forEach { it.close() }
  }

  @Test fun youngPendingSocketsAreNeverEvictedSoAMidHandshakeClientSurvivesAFlood() {
    val h = harness(PATIENT.copy(maxPending = 4, nanoTime = clock))
    val legit = h.connect()
    awaitAccepted(1)
    val idle = (1..20).map { h.connect() }
    // Accepted in order: three fit beside the legitimate client, the rest are refused.
    awaitAccepted(20)
    legit.getOutputStream().write(h.request(h.cookie(h.secret)))
    h.take()
    assertTrue(h.admitted.isEmpty())
    // The 20 flooders arrived after three fit; the rest were refused, not queued.
    assertTrue(idle.drop(3).all { h.isClosedByServer(it) })
  }

  @Test fun fullQueueRefusesTheNewcomerWhenNothingIsOldEnoughToEvict() {
    val h = harness(PATIENT.copy(maxPending = 2, nanoTime = clock))
    h.connect()
    h.connect()
    awaitAccepted(2)
    val third = h.connect()
    third.getOutputStream().write(h.request(h.cookie(h.secret)))
    assertTrue(h.isClosedByServer(third))
    h.awaitLogs(1)
    assertTrue(h.logs.single().contains("pending-full"))
    assertTrue(h.admitted.isEmpty())
  }

  @Test fun silentSocketsOlderThanTheEvictionAgeAreEvictedToMakeRoom() {
    val h = harness(PATIENT.copy(maxPending = 2, minEvictAgeMs = 250, nanoTime = clock))
    val oldest = h.connect()
    val second = h.connect()
    awaitAccepted(2)
    now.addAndGet(300_000_000L)
    val newcomer = h.connect()
    newcomer.getOutputStream().write(h.request(h.cookie(h.secret)))
    h.take()
    assertTrue(h.isClosedByServer(oldest))
    // Only the oldest silent socket was evicted; the other still has room to authenticate.
    second.getOutputStream().write(h.request(h.cookie(h.secret)))
    h.take()
  }

  @Test fun aSocketThatHasStartedSendingIsNotEvictedHoweverOldItIs() {
    val limits = PATIENT.copy(
      maxPending = 2,
      minEvictAgeMs = 250,
      nanoTime = clock,
      onFirstByte = { firstBytes.release() }
    )
    val h = harness(limits)
    val sending = h.connect()
    sending.getOutputStream().write("GET / HTTP/1.1\r\n".toByteArray())
    val silent = h.connect()
    awaitAccepted(2)
    assertTrue(firstBytes.tryAcquire(10, TimeUnit.SECONDS))
    // Both are older than the eviction age, but only the silent one may be evicted.
    now.addAndGet(300_000_000L)
    val newcomer = h.connect()
    newcomer.getOutputStream().write(h.request(h.cookie(h.secret)))
    h.take()
    assertTrue(h.isClosedByServer(silent))
    sending.getOutputStream().write(("Host: a\r\n" + h.cookie(h.secret) + "\r\n\r\n").toByteArray())
    h.take()
  }

  @Test fun concurrentFloodDoesNotDisplaceFiftyLegitimateClientsMidHandshake() {
    val h = harness(PATIENT.copy(maxPending = 64, maxAuthenticated = 50, nanoTime = clock))
    val legit = (1..50).map { h.connect() }
    awaitAccepted(50)
    val go = CountDownLatch(1)
    val flooders = (1..4).map {
      Thread {
        go.await()
        repeat(100) {
          try {
            floodSockets.add(Socket("127.0.0.1", h.listener.port))
          } catch (_: java.io.IOException) {
            // The backlog can be full under flood; that is the point.
          }
        }
      }.apply { isDaemon = true }
    }
    flooders.forEach { it.start() }
    go.countDown()
    // Heads arrive while the flood is in progress; the flood never evicts a young socket.
    legit.forEach { it.getOutputStream().write(h.request(h.cookie(h.secret))) }
    repeat(50) { h.take() }
    flooders.forEach { it.join(10_000) }
    assertTrue(h.admitted.isEmpty())
  }
}
