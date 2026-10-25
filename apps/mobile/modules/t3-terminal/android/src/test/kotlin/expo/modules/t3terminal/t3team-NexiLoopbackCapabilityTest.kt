// Fork files use the t3team- prefix, which is not a Kotlin class identifier.
@file:Suppress("ktlint:standard:filename", "MatchingDeclarationName")

package expo.modules.t3terminal

import java.util.concurrent.atomic.AtomicLong
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Native HTTP clients (Expo's downloader and uploader, Coil, ExoPlayer, the chip icon loader) cannot
 * send the cookie, so the exact signed URLs the app hands them are registered as capabilities.
 */
class NexiLoopbackCapabilityTest {
  private val harnesses = mutableListOf<Harness>()
  private val now = AtomicLong(1_000_000_000L)
  private val limits = PATIENT.copy(nanoTime = { now.get() })
  private val target = "/api/assets/tok.en-1/My%20file.pdf?sig=a%2Fb"

  private fun harness(l: LoopbackLimits = limits) = Harness(l).also { harnesses.add(it) }

  private fun raw(method: String, path: String, vararg headers: String) =
    (listOf("$method $path HTTP/1.1", "Host: 127.0.0.1") + headers).joinToString("\r\n") +
      "\r\n\r\n"

  private fun Harness.send(method: String, path: String, vararg headers: String): java.net.Socket {
    val tcp = connect()
    tcp.getOutputStream().write(raw(method, path, *headers).toByteArray())
    return tcp
  }

  @After fun tearDown() = harnesses.forEach { it.close() }

  @Test fun registeredSignedUrlIsAdmittedWithoutTheCookieAndForwardedUnchanged() {
    val h = harness()
    h.listener.allowTarget(target)
    h.send("GET", target, "Range: bytes=0-99")
    val forwarded = String(h.take().second, Charsets.ISO_8859_1)
    assertEquals(raw("GET", target, "Range: bytes=0-99"), forwarded)
    h.send("HEAD", target)
    h.take()
    // Multi-use: a media player re-requests the same URL for every seek.
    h.send("GET", target, "Range: bytes=100-")
    h.take()
  }

  @Test fun anythingElseIsStillRefusedWithoutACredential() {
    val h = harness()
    h.listener.allowTarget(target)
    val refused = listOf(
      "/api/assets/tok.en-2/My%20file.pdf?sig=a%2Fb",
      "$target&x=1",
      target.substringBefore('?'),
      "${target}x",
      target.replace("assets", "Assets"),
      "/.well-known/t3/environment",
      "/",
      "http://127.0.0.1:${h.listener.port}$target",
      "*"
    )
    for (path in refused) {
      val tcp = h.send("GET", path)
      assertTrue(path, h.isClosedByServer(tcp))
    }
    assertTrue(h.admitted.isEmpty())
  }

  @Test fun onlyReadsAndUploadsAreAdmittedByACapability() {
    val h = harness()
    h.listener.allowTarget(target)
    h.send("POST", target, "Content-Type: image/png")
    h.take()
    for (method in listOf("PUT", "DELETE", "PATCH", "CONNECT", "OPTIONS", "get", "TRACE")) {
      val tcp = h.send(method, target)
      assertTrue(method, h.isClosedByServer(tcp))
    }
    assertTrue(h.admitted.isEmpty())
  }

  @Test fun aCapabilityExpiresAndIsClearedWhenTheListenerCloses() {
    val h = harness(limits.copy(capabilityTtlMs = 60_000))
    h.listener.allowTarget(target)
    now.addAndGet(59_000_000_000L)
    h.send("GET", target)
    h.take()
    now.addAndGet(2_000_000_000L)
    assertTrue(h.isClosedByServer(h.send("GET", target)))
    // Re-registering (a refreshed URL) revives it.
    h.listener.allowTarget(target)
    h.send("GET", target)
    h.take()
    val port = h.listener.port
    h.listener.close()
    assertFalse(h.listener.allowTarget(target))
    assertTrue(port > 0)
  }

  @Test fun aCapabilityBelongsToItsTunnelAlone() {
    val a = harness()
    val b = harness()
    a.listener.allowTarget(target)
    assertTrue(b.isClosedByServer(b.send("GET", target)))
    assertTrue(b.admitted.isEmpty())
  }

  @Test fun theOldestCapabilityIsDroppedPastTheLimit() {
    val h = harness(limits.copy(maxCapabilities = 3))
    for (i in 1..4) h.listener.allowTarget("/api/assets/t$i/f")
    assertTrue(h.isClosedByServer(h.send("GET", "/api/assets/t1/f")))
    for (i in 2..4) {
      h.send("GET", "/api/assets/t$i/f")
      h.take()
    }
  }

  @Test fun foreignOriginsAreRefusedEvenForARegisteredUrl() {
    val h = harness()
    h.listener.allowTarget(target)
    val tcp = h.send("GET", target, "Origin: https://localhost")
    assertTrue(h.isClosedByServer(tcp))
    val cross = h.send("GET", target, "Sec-Fetch-Site: cross-site")
    assertTrue(h.isClosedByServer(cross))
    assertTrue(h.admitted.isEmpty())
  }

  @Test fun percentEscapeCaseIsNormalizedButDecodedMeaningIsNot() {
    val h = harness()
    h.listener.allowTarget("/api/assets/t/a%2fb?x=%e2%9c%93")
    h.send("GET", "/api/assets/t/a%2Fb?x=%E2%9C%93")
    h.take()
    assertTrue(h.isClosedByServer(h.send("GET", "/api/assets/t/a/b?x=%E2%9C%93")))
    assertTrue(h.isClosedByServer(h.send("GET", "/api/assets/t/a%2Fb?x=✓")))
  }

  @Test fun deniedConnectionsLogOnlyAFixedReason() {
    val h = harness()
    h.listener.allowTarget(target)
    val tcp = h.send("GET", "/api/assets/guess/f")
    assertTrue(h.isClosedByServer(tcp))
    h.awaitLogs(1)
    assertEquals("loopback connection rejected: reason=no-credential total=1", h.logs.single())
  }

  @Test fun targetsAreOnlyBuiltFromAUrlOnTheTunnelsOwnPort() {
    assertEquals(
      "/api/assets/t/f.pdf?a=1",
      NexiCapabilityTargets.targetFor("http://127.0.0.1:4100/api/assets/t/f.pdf?a=1#frag", 4100)
    )
    for (url in listOf(
      "http://127.0.0.1:4101/x",
      "https://127.0.0.1:4100/x",
      "http://localhost:4100/x",
      "http://user@127.0.0.1:4100/x",
      "http://127.0.0.1:4100",
      "ftp://127.0.0.1:4100/x",
      "not a url",
      ""
    )) {
      assertNull(url, NexiCapabilityTargets.targetFor(url, 4100))
    }
  }
}
