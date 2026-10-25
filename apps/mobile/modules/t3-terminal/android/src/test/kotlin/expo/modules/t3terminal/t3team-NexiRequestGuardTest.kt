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
 * A registered signed URL admits that request, not the connection: every later request on a
 * capability-admitted connection is checked as it is read, as the pipe would read it.
 */
class NexiRequestGuardTest {
  private val harnesses = mutableListOf<Harness>()
  private val now = AtomicLong(1_000_000_000L)
  private val target = "/api/assets/tok/file.bin?sig=1"
  private val other = "/api/assets/tok/other.bin?sig=2"

  private fun harness(limits: LoopbackLimits = PATIENT.copy(nanoTime = { now.get() })) =
    Harness(limits).also {
      harnesses.add(it)
      it.listener.allowTarget(target)
      it.listener.allowTarget(other)
    }

  private fun request(method: String, path: String, vararg headers: String) =
    (listOf("$method $path HTTP/1.1", "Host: 127.0.0.1") + headers).joinToString("\r\n") +
      "\r\n\r\n"

  private fun Socket.write(text: String) = getOutputStream().write(text.toByteArray(Charsets.ISO_8859_1))

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
    } catch (_: IOException) {
      // The pipe ends the connection on this.
    }
  }

  private fun Harness.refusalReasons() = logs.map { it.substringAfter("reason=").substringBefore(" ") }

  @After fun tearDown() = harnesses.forEach { it.close() }

  @Test fun allowedGetThenAnUnrelatedGetOnTheSameSocketIsRefusedAndClosed() {
    val h = harness()
    val client = h.connect()
    val first = request("GET", target)
    client.write(first)
    val (_, stream) = h.takeStream()
    assertEquals(first, stream.readText(first.length))
    client.write(request("GET", "/api/orchestration/state"))
    stream.expectRefused()
    assertTrue(h.isClosedByServer(client))
    h.awaitLogs(1)
    assertEquals(listOf("capability-not-registered"), h.refusalReasons())
  }

  @Test fun anUnrelatedRequestPipelinedInTheSamePacketIsNeverForwarded() {
    val h = harness()
    val client = h.connect()
    val first = request("GET", target)
    client.write(first + request("DELETE", "/unregistered"))
    val (_, stream) = h.takeStream()
    // The whole packet is dropped: not even the registered request before it is forwarded.
    stream.expectRefused()
    assertTrue(h.isClosedByServer(client))
    assertEquals(listOf("capability-method"), h.refusalReasons())
  }

  @Test fun aSecondRegisteredRequestInTheSamePacketIsForwarded() {
    val h = harness()
    val client = h.connect()
    val both = request("GET", target) + request("GET", other, "Range: bytes=0-9")
    client.write(both)
    val (_, stream) = h.takeStream()
    assertEquals(both, stream.readText(both.length))
  }

  @Test fun postBodyThatContainsARequestLineIsOnlyABody() {
    val h = harness()
    val client = h.connect()
    val body = "GET /api/orchestration/state HTTP/1.1\r\nHost: x\r\n\r\n"
    val post = request("POST", target, "Content-Length: ${body.length}") + body
    client.write(post)
    val (_, stream) = h.takeStream()
    assertEquals(post, stream.readText(post.length))
    // The body ended exactly at Content-Length: what follows is a request again, and is checked.
    client.write(request("GET", "/after-the-body"))
    stream.expectRefused()
    assertEquals(listOf("capability-not-registered"), h.refusalReasons())
  }

  @Test fun keepAliveRangeRequestsAndHeadToTheRegisteredTargetKeepWorking() {
    val h = harness()
    val client = h.connect()
    var stream: InputStream? = null
    for ((index, text) in listOf(
      request("GET", target, "Range: bytes=0-99"),
      request("GET", target, "Range: bytes=100-199"),
      request("HEAD", target),
      request("GET", target, "Range: bytes=200-")
    ).withIndex()) {
      client.write(text)
      val current = stream ?: h.takeStream().second.also { stream = it }
      assertEquals("request $index", text, current.readText(text.length))
    }
    assertTrue(h.logs.isEmpty())
  }

  @Test fun aLargeUploadBodyIsStreamedThroughWithoutBeingInspected() {
    val h = harness()
    val client = h.connect()
    val size = 8 * 1024 * 1024
    client.write(request("POST", target, "Content-Length: $size"))
    val (_, stream) = h.takeStream()
    val writer = Thread {
      val chunk = ByteArray(64 * 1024) { 'G'.code.toByte() }
      repeat(size / chunk.size) { client.getOutputStream().write(chunk) }
    }.apply { start() }
    val head = request("POST", target, "Content-Length: $size")
    stream.readText(head.length)
    var seen = 0L
    val buffer = ByteArray(64 * 1024)
    while (seen < size) seen += stream.read(buffer)
    writer.join(10_000)
    assertEquals(size.toLong(), seen)
  }

  @Test fun everyShapeThatCouldSmuggleARequestIsRefused() {
    val cases = mapOf(
      "body-on-read" to request("GET", target, "Content-Length: 5") + "hello",
      "length-required" to request("POST", target),
      "transfer-encoding" to request("POST", target, "Transfer-Encoding: chunked"),
      "duplicate-content-length" to request("POST", target, "Content-Length: 1", "Content-Length: 1"),
      "bad-content-length" to request("POST", target, "Content-Length: +5"),
      "bad-content-length" to request("POST", target, "Content-Length: 99999999999999999999"),
      "body-too-large" to request("POST", target, "Content-Length: 4096"),
      "upgrade" to request("GET", target, "Upgrade: websocket"),
      "upgrade" to request("GET", target, "Connection: keep-alive, Upgrade"),
      "expect" to request("POST", target, "Content-Length: 1", "Expect: 100-continue"),
      "bad-header-name" to request("GET", target, "Content-Length : 0"),
      "bad-header-name" to request("GET", target, "no colon here"),
      "folded-header" to request("GET", target, " folded: x"),
      "bad-framing" to "GET $target HTTP/1.1\nHost: x\n\n",
      "bad-framing" to "GET $target HTTP/1.1\r\nHost: x\rY: z\r\n\r\n",
      "bad-target" to request("GET", "http://127.0.0.1/api/assets/tok/file.bin"),
      "method" to request("CONNECT", "127.0.0.1:80"),
      "not-registered" to request("GET", "$target&x=1"),
      "bad-request-line" to "GET $target\r\nHost: x\r\n\r\n"
    )
    val limits = PATIENT.copy(nanoTime = { now.get() }, maxCapabilityBodyBytes = 1024)
    for ((reason, second) in cases) {
      val h = harness(limits)
      val client = h.connect()
      val first = request("GET", target)
      client.write(first)
      val (_, stream) = h.takeStream()
      stream.readText(first.length)
      client.write(second)
      stream.expectRefused()
      assertEquals(second, listOf(reason), h.refusalReasons().map { it.removePrefix("capability-") })
    }
  }

  @Test fun anOversizedHeadAfterAdmissionIsRefused() {
    val h = harness()
    val client = h.connect()
    val first = request("GET", target)
    client.write(first)
    val (_, stream) = h.takeStream()
    stream.readText(first.length)
    client.write("GET $target HTTP/1.1\r\nX-Pad: " + "a".repeat(NexiLoopbackAuth.MAX_HEAD_BYTES + 10))
    stream.expectRefused()
    assertEquals(listOf("capability-head-too-large"), h.refusalReasons())
  }

  @Test fun theRequestCountPerConnectionIsBounded() {
    val h = harness(PATIENT.copy(nanoTime = { now.get() }, maxCapabilityRequests = 3))
    val client = h.connect()
    val text = request("GET", target)
    client.write(text)
    val stream = h.takeStream().second
    stream.readText(text.length)
    repeat(2) {
      client.write(text)
      stream.readText(text.length)
    }
    client.write(text)
    stream.expectRefused()
    assertEquals(listOf("capability-too-many-requests"), h.refusalReasons())
  }

  @Test fun aRegistrationThatExpiresMidConnectionStopsAdmittingRequests() {
    val h = harness(PATIENT.copy(nanoTime = { now.get() }, capabilityTtlMs = 1000))
    val client = h.connect()
    val text = request("GET", target)
    client.write(text)
    val stream = h.takeStream().second
    stream.readText(text.length)
    now.addAndGet(2_000_000_000L)
    client.write(text)
    stream.expectRefused()
    assertEquals(listOf("capability-not-registered"), h.refusalReasons())
  }

  @Test fun theSecretAuthenticatedPathIsForwardedAsSentWithNoRequestChecks() {
    val h = harness()
    val client = h.connect()
    val first = request("GET", "/.well-known/t3/environment", "Cookie: ${NexiLoopbackHead.cookieName(h.listener.port)}=${h.secret}")
    client.write(first)
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
