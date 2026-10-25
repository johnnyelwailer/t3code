// Fork files use the t3team- prefix, which is not a Kotlin class identifier.
@file:Suppress("ktlint:standard:filename", "MatchingDeclarationName")

package expo.modules.t3terminal

import java.io.IOException
import java.io.InputStream
import java.net.Socket
import java.util.concurrent.atomic.AtomicLong
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

/**
 * A registered signed URL admits exactly one request: the head goes out with `Connection: close`,
 * a POST body is framed by Content-Length, and nothing else may follow on that connection. The tests
 * read the stream the way the pipe does.
 */
class NexiRequestGuardTest {
  private val harnesses = mutableListOf<Harness>()
  private val now = AtomicLong(1_000_000_000L)
  private val target = "/api/assets/tok/file.bin?sig=1"
  private val other = "/api/assets/tok/other.bin?sig=2"
  private val upload = "/api/attachments/upload/payload.sig"

  private fun harness(limits: LoopbackLimits = PATIENT.copy(nanoTime = { now.get() })) =
    Harness(limits).also {
      harnesses.add(it)
      it.listener.allowTarget(target)
      it.listener.allowTarget(other)
      it.listener.allowTarget(upload)
    }

  private fun request(method: String, path: String, vararg headers: String) =
    (listOf("$method $path HTTP/1.1", "Host: 127.0.0.1") + headers).joinToString("\r\n") +
      "\r\n\r\n"

  private fun Socket.write(text: String) = getOutputStream().write(
    text.toByteArray(Charsets.ISO_8859_1)
  )

  private fun InputStream.readText(count: Int): String {
    val out = ByteArray(count)
    var read = 0
    while (read < count) {
      val n = read(out, read, count - read)
      if (n < 0) throw AssertionError("stream ended after $read of $count bytes")
      read += n
    }
    return String(out, Charsets.ISO_8859_1)
  }

  private fun InputStream.expectRefused() {
    try {
      read(ByteArray(64 * 1024))
      fail("the request should have been refused")
    } catch (refused: IOException) {
      // The pipe ends the connection on this; a read timeout is not a refusal.
      assertEquals("The loopback request was refused", refused.message)
    }
  }

  private fun Harness.refusalReasons() = logs.map {
    it.substringAfter("reason=").substringBefore(" ")
  }

  /** What the host should see for `text`: the head with `Connection: close` in place of any other. */
  private fun closing(text: String) = text.replace("\r\n\r\n", "\r\nConnection: close\r\n\r\n")

  /** A head the guard refuses is admitted first (it matches the registration) and refused on read. */
  private fun Harness.takeStreamOrRefusal(): InputStream? = takeStream().second

  @After fun tearDown() = harnesses.forEach { it.close() }

  @Test fun theHeadIsForwardedAsOneClosingRequestAndNothingMayFollow() {
    val h = harness()
    val client = h.connect()
    client.write(request("GET", target, "Connection: keep-alive", "Range: bytes=0-9"))
    val (_, stream) = h.takeStream()
    val sent = closing(request("GET", target, "Range: bytes=0-9"))
    assertEquals(sent, stream.readText(sent.length))
    client.write(request("GET", "/api/orchestration/state"))
    stream.expectRefused()
    assertTrue(h.isClosedByServer(client))
    h.awaitLogs(1)
    assertEquals(listOf("capability-extra-bytes"), h.refusalReasons())
  }

  @Test fun theReviewersProbeAPipelinedPostAndALaterUpgradeNeverReachTheHost() {
    val h = harness()
    val client = h.connect()
    client.write(
      request("GET", target) + request("POST", "/api/orchestration/dispatch", "Content-Length: 0")
    )
    val (_, stream) = h.takeStream()
    // Nothing is forwarded: the packet carried more than the one registered request.
    stream.expectRefused()
    assertTrue(h.isClosedByServer(client))
    val second = harness()
    val late = second.connect()
    late.write(request("GET", target))
    val lateStream = second.takeStream().second
    lateStream.readText(closing(request("GET", target)).length)
    late.write(request("GET", "/ws", "Upgrade: websocket", "Connection: Upgrade"))
    lateStream.expectRefused()
    assertTrue(second.isClosedByServer(late))
  }

  @Test fun aRegisteredRequestPipelinedBehindAnotherIsAlsoRefused() {
    val h = harness()
    val client = h.connect()
    client.write(request("GET", target) + request("GET", other))
    h.takeStream().second.expectRefused()
    assertEquals(listOf("capability-extra-bytes"), h.refusalReasons())
  }

  @Test fun aPostBodyThatContainsARequestLineIsOnlyABodyAndEndsTheRequest() {
    val h = harness()
    val client = h.connect()
    val body = "GET /api/orchestration/state HTTP/1.1\r\nHost: x\r\n\r\n"
    val post = request("POST", upload, "Content-Length: ${body.length}") + body
    client.write(post)
    val (_, stream) = h.takeStream()
    val sent = closing(request("POST", upload, "Content-Length: ${body.length}")) + body
    assertEquals(sent, stream.readText(sent.length))
    client.write(request("GET", target))
    stream.expectRefused()
    assertEquals(listOf("capability-extra-bytes"), h.refusalReasons())
  }

  @Test fun aBodyLongerThanContentLengthIsRefused() {
    val h = harness()
    val client = h.connect()
    client.write(request("POST", upload, "Content-Length: 3") + "abcGET /x HTTP/1.1\r\n\r\n")
    h.takeStream().second.expectRefused()
    assertEquals(listOf("capability-extra-bytes"), h.refusalReasons())
  }

  @Test fun aLargeUploadBodyIsStreamedThroughWithoutBeingInspected() {
    val h = harness()
    val client = h.connect()
    val size = 8 * 1024 * 1024
    client.write(request("POST", upload, "Content-Length: $size"))
    val (_, stream) = h.takeStream()
    val writer = Thread {
      val chunk = ByteArray(64 * 1024) { 'G'.code.toByte() }
      repeat(size / chunk.size) { client.getOutputStream().write(chunk) }
    }.apply { start() }
    stream.readText(closing(request("POST", upload, "Content-Length: $size")).length)
    var seen = 0L
    val buffer = ByteArray(64 * 1024)
    while (seen < size) seen += stream.read(buffer)
    writer.join(10_000)
    assertEquals(size.toLong(), seen)
  }

  @Test fun everyShapeThatCouldSmuggleARequestIsRefusedOnTheRegisteredTarget() {
    val cases = listOf(
      "body-on-read" to request("GET", target, "Content-Length: 5") + "hello",
      "length-required" to request("POST", upload),
      "transfer-encoding" to request("POST", upload, "Transfer-Encoding: chunked"),
      "duplicate-content-length" to
        request("POST", upload, "Content-Length: 1", "Content-Length: 1"),
      "bad-content-length" to request("POST", upload, "Content-Length: +5"),
      "bad-content-length" to request("POST", upload, "Content-Length: 99999999999999999999"),
      "body-too-large" to request("POST", upload, "Content-Length: 4096"),
      "upgrade" to request("GET", target, "Upgrade: websocket"),
      "upgrade" to request("GET", target, "Connection: keep-alive, Upgrade"),
      "expect" to request("POST", upload, "Content-Length: 1", "Expect: 100-continue"),
      "bad-header-name" to request("GET", target, "Content-Length : 0"),
      "bad-header-name" to request("GET", target, "no colon here"),
      "bad-framing" to "GET $target HTTP/1.1\r\nHost: x\rY: z\r\n\r\n"
    )
    val limits = PATIENT.copy(nanoTime = { now.get() }, maxCapabilityBodyBytes = 1024)
    for ((reason, text) in cases) {
      val h = harness(limits)
      val client = h.connect()
      client.write(text)
      val stream = h.takeStreamOrRefusal() ?: continue
      stream.expectRefused()
      assertEquals(text, listOf(reason), h.refusalReasons().map { it.removePrefix("capability-") })
      assertTrue(h.isClosedByServer(client))
    }
  }

  @Test fun anOversizedHeadAfterTheRequestIsRefusedAsExtraBytes() {
    val h = harness()
    val client = h.connect()
    val first = request("GET", target)
    client.write(first)
    val (_, stream) = h.takeStream()
    stream.readText(closing(first).length)
    client.write("x".repeat(NexiLoopbackAuth.MAX_HEAD_BYTES + 10))
    stream.expectRefused()
    assertEquals(listOf("capability-extra-bytes"), h.refusalReasons())
  }

  @Test fun aRegistrationThatExpiredIsNotAdmittedOnANewConnection() {
    val h = harness(PATIENT.copy(nanoTime = { now.get() }, capabilityTtlMs = 1000))
    h.listener.allowTarget(target)
    now.addAndGet(2_000_000_000L)
    assertTrue(h.isClosedByServer(h.connect().also { it.write(request("GET", target)) }))
  }

  @Test fun theSecretAuthenticatedPathIsForwardedAsSentWithNoRequestChecks() {
    val h = harness()
    val client = h.connect()
    val cookie = "Cookie: ${NexiLoopbackHead.cookieName(h.listener.port)}=${h.secret}"
    client.write(request("GET", "/.well-known/t3/environment", cookie))
    val (_, stream) = h.takeStream()
    val head = request("GET", "/.well-known/t3/environment")
    assertEquals(head, stream.readText(head.length))
    val later = request("DELETE", "/anything") + request("POST", "/x", "Transfer-Encoding: chunked")
    client.write(later)
    assertEquals(later, stream.readText(later.length))
    assertTrue(h.logs.isEmpty())
    assertFalse(h.listener.isClosed)
  }
}
