// Fork files use the t3team- prefix, which is not a Kotlin class identifier.
@file:Suppress("ktlint:standard:filename", "MatchingDeclarationName")

package expo.modules.t3terminal

import java.io.IOException
import java.io.InputStream
import java.net.Socket
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

/**
 * On a secret-authenticated connection every request head loses the loopback credentials, not just
 * the first: keep-alive clients send the cookie jar again with each request.
 */
class NexiAuthenticatedStreamTest {
  private val harnesses = mutableListOf<Harness>()

  private fun harness() = Harness().also { harnesses.add(it) }

  private fun Harness.cookie() = "Cookie: theme=dark; ${NexiLoopbackHead.cookieName(
    listener.port
  )}=$secret; sid=1"

  private fun Harness.other(port: Int) = "t3lb$port=${NexiLoopbackAuth.newSecret()}"

  private fun head(method: String, path: String, vararg headers: String) =
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

  private fun InputStream.expectRefused(reason: String, h: Harness) {
    try {
      read(ByteArray(64 * 1024))
      fail("$reason should have been refused")
    } catch (refused: IOException) {
      assertEquals("The loopback request was refused", refused.message)
    }
    h.awaitLogs(1)
    assertTrue(h.logs.last(), h.logs.last().contains("reason=request-$reason"))
  }

  @After fun tearDown() = harnesses.forEach { it.close() }

  @Test fun aKeepAliveClientSendingThreeCookieCarryingRequestsLeaksNoCredentialOnAnyOfThem() {
    val h = harness()
    val client = h.connect()
    val extra = "X-T3-Loopback: ${h.secret}"
    val sent = listOf(
      head("GET", "/.well-known/t3/environment", h.cookie()),
      head("GET", "/api/orchestration/state", h.cookie(), extra, "Accept: */*"),
      head("POST", "/api/x", "Content-Length: 2", h.cookie()) + "hi"
    )
    val expected = listOf(
      head("GET", "/.well-known/t3/environment", "Cookie: theme=dark; sid=1"),
      head("GET", "/api/orchestration/state", "Cookie: theme=dark; sid=1", "Accept: */*"),
      head("POST", "/api/x", "Content-Length: 2", "Cookie: theme=dark; sid=1") + "hi"
    )
    client.write(sent[0])
    val (_, stream) = h.takeStream()
    var seen = stream.readText(expected[0].length)
    for (index in 1..2) {
      client.write(sent[index])
      seen += stream.readText(expected[index].length)
    }
    assertEquals(expected.joinToString(""), seen)
    assertFalse(seen.contains("t3lb"))
    assertFalse(seen.contains(h.secret))
    assertFalse(seen.lowercase().contains("x-t3-loopback"))
  }

  @Test fun otherTunnelsCookiesAreStrippedToo() {
    val h = harness()
    val client = h.connect()
    client.write(
      head(
        "GET",
        "/a",
        "Cookie: ${h.other(1111)}; ${NexiLoopbackHead.cookieName(h.listener.port)}=${h.secret}"
      )
    )
    val (_, stream) = h.takeStream()
    stream.readText(head("GET", "/a").length)
    client.write(head("GET", "/b", "Cookie: ${h.other(2222)}"))
    assertEquals(head("GET", "/b"), stream.readText(head("GET", "/b").length))
  }

  @Test fun pipelinedRequestsInOnePacketAndByteAtATimeWritesAreAllStripped() {
    val h = harness()
    val client = h.connect()
    val one = head("GET", "/one", h.cookie())
    val two = head("GET", "/two", h.cookie())
    client.write(one + two)
    val (_, stream) = h.takeStream()
    val expected =
      head("GET", "/one", "Cookie: theme=dark; sid=1") +
        head("GET", "/two", "Cookie: theme=dark; sid=1")
    assertEquals(expected, stream.readText(expected.length))
    val slow = head("GET", "/three", h.cookie())
    slow.forEach {
      client.getOutputStream().write(it.code)
      client.getOutputStream().flush()
    }
    val three = head("GET", "/three", "Cookie: theme=dark; sid=1")
    assertEquals(three, stream.readText(three.length))
  }

  @Test fun anUpgradeRequestIsStrippedThenTheConnectionIsARawPipe() {
    val h = harness()
    val client = h.connect()
    client.write(head("GET", "/ws", "Upgrade: websocket", "Connection: Upgrade", h.cookie()))
    val (_, stream) = h.takeStream()
    val upgrade =
      head("GET", "/ws", "Upgrade: websocket", "Connection: Upgrade", "Cookie: theme=dark; sid=1")
    assertEquals(upgrade, stream.readText(upgrade.length))
    // WebSocket frames are never parsed: binary bytes and text that looks like a request or a cookie
    // pass through untouched, and nothing is refused.
    val frames = String(ByteArray(300) { (it * 7).toByte() }, Charsets.ISO_8859_1) +
      head("DELETE", "/x", "Cookie: t3lb9=keep", "Transfer-Encoding: gzip")
    client.write(frames)
    assertEquals(frames, stream.readText(frames.length))
    assertTrue(h.logs.isEmpty())
  }

  @Test fun anUpgradeRequestCarryingABodyIsRefused() {
    val h = harness()
    val client = h.connect()
    client.write(head("GET", "/ws", "Upgrade: websocket", "Content-Length: 4", h.cookie()) + "body")
    h.takeStream().second.expectRefused("upgrade-with-body", h)
  }

  @Test fun bodiesAreFramedByContentLengthSoABodyIsNeverReadAsARequest() {
    val h = harness()
    val client = h.connect()
    val body = head("GET", "/inside", "Cookie: t3lb9=in-the-body")
    client.write(head("POST", "/upload", "Content-Length: ${body.length}", h.cookie()) + body)
    val (_, stream) = h.takeStream()
    val first =
      head("POST", "/upload", "Content-Length: ${body.length}", "Cookie: theme=dark; sid=1") + body
    assertEquals(first, stream.readText(first.length))
    client.write(head("GET", "/next", h.cookie()))
    assertEquals(
      head("GET", "/next", "Cookie: theme=dark; sid=1"),
      stream.readText(head("GET", "/next", "Cookie: theme=dark; sid=1").length)
    )
  }

  @Test fun chunkedBodiesAreFramedWithExtensionsAndTrailersAndTheNextRequestIsStripped() {
    val h = harness()
    val client = h.connect()
    val inner = head("GET", "/inside", "Cookie: t3lb9=in-a-chunk")
    val chunked = "${Integer.toHexString(
      inner.length
    )};name=value\r\n$inner\r\n0\r\nX-Trailer: 1\r\n\r\n"
    val request = head("POST", "/upload", "Transfer-Encoding: chunked", h.cookie()) + chunked
    client.write(request)
    val (_, stream) = h.takeStream()
    val forwarded =
      head("POST", "/upload", "Transfer-Encoding: chunked", "Cookie: theme=dark; sid=1") + chunked
    assertEquals(forwarded, stream.readText(forwarded.length))
    client.write(head("GET", "/next", h.cookie()))
    val next = head("GET", "/next", "Cookie: theme=dark; sid=1")
    assertEquals(next, stream.readText(next.length))
  }

  @Test fun malformedChunkFramingIsRefused() {
    val cases = mapOf(
      "zz\r\nabc\r\n0\r\n\r\n" to "bad size",
      "3\r\nabcXY0\r\n\r\n" to "no CRLF after data",
      "-1\r\n" to "negative",
      "1234567890123456\r\n" to "too many digits",
      "0\r\n folded: x\r\n\r\n" to "folded trailer"
    )
    for ((chunks, label) in cases) {
      val h = harness()
      val client = h.connect()
      client.write(head("POST", "/u", "Transfer-Encoding: chunked", h.cookie()) + chunks)
      h.takeStream().second.expectRefused("bad-chunk", h)
      assertTrue(label, h.isClosedByServer(client))
    }
  }

  @Test fun ambiguousFramingIsRefusedLikeOnTheCapabilityPath() {
    val cases = listOf(
      "ambiguous-length" to head("POST", "/u", "Content-Length: 3", "Transfer-Encoding: chunked"),
      "transfer-encoding" to head("POST", "/u", "Transfer-Encoding: gzip, chunked"),
      "transfer-encoding" to
        head("POST", "/u", "Transfer-Encoding: chunked", "Transfer-Encoding: chunked"),
      "duplicate-content-length" to head("POST", "/u", "Content-Length: 1", "Content-Length: 1"),
      "bad-content-length" to head("POST", "/u", "Content-Length: 1e3"),
      "bad-header-name" to head("GET", "/u", "Content-Length : 0"),
      "folded-header" to head("GET", "/u", " folded: x"),
      "bad-framing" to "GET /u HTTP/1.1\r\nHost: x\rY: z\r\n\r\n",
      "bad-request-line" to "GET /u\r\nHost: x\r\n\r\n"
    )
    for ((reason, text) in cases) {
      val h = harness()
      val client = h.connect()
      client.write(head("GET", "/ok", h.cookie()))
      val (_, stream) = h.takeStream()
      stream.readText(head("GET", "/ok", "Cookie: theme=dark; sid=1").length)
      client.write(text)
      stream.expectRefused(if (reason == "folded-header") "folded-header" else reason, h)
      assertTrue(text, h.isClosedByServer(client))
    }
  }

  @Test fun aLaterRequestFromAForeignOriginOrWithDuplicateCookiesIsRefused() {
    val h = harness()
    val client = h.connect()
    client.write(head("GET", "/ok", h.cookie()))
    val (_, stream) = h.takeStream()
    stream.readText(head("GET", "/ok", "Cookie: theme=dark; sid=1").length)
    client.write(head("GET", "/page", "Origin: http://127.0.0.1:${h.listener.port + 1}"))
    stream.expectRefused("bad-origin", h)
    val second = harness()
    val other = second.connect()
    other.write(head("GET", "/ok", second.cookie()))
    val (_, secondStream) = second.takeStream()
    secondStream.readText(head("GET", "/ok", "Cookie: theme=dark; sid=1").length)
    other.write(head("GET", "/dup", "Cookie: a=1", "Cookie: b=2"))
    secondStream.expectRefused("duplicate-cookie", second)
  }

  @Test fun manySmallKeepAliveRequestsAreParsedAndStrippedQuickly() {
    val h = harness()
    val client = h.connect()
    client.write(head("GET", "/0", h.cookie()))
    val (_, stream) = h.takeStream()
    stream.readText(head("GET", "/0", "Cookie: theme=dark; sid=1").length)
    val count = 3000
    val writer = Thread {
      for (i in 1..count) client.write(head("GET", "/$i", h.cookie()))
    }.apply { start() }
    val started = System.nanoTime()
    var bytes = 0L
    val expectedBytes = (1..count).sumOf {
      head("GET", "/$it", "Cookie: theme=dark; sid=1").length.toLong()
    }
    val buffer = ByteArray(64 * 1024)
    var leaked = false
    while (bytes < expectedBytes) {
      val n = stream.read(buffer)
      leaked = leaked || String(buffer, 0, n, Charsets.ISO_8859_1).contains("t3lb")
      bytes += n
    }
    writer.join(10_000)
    val micros = (System.nanoTime() - started) / 1000 / count
    println("authenticated stream: $count keep-alive requests, $micros us per request")
    assertFalse(leaked)
    assertEquals(expectedBytes, bytes)
  }
}
