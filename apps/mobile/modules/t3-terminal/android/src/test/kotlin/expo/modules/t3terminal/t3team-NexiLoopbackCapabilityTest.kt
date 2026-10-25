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
  private val upload = "/api/attachments/upload/payload.sig"

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

  @Test fun registeredSignedUrlIsAdmittedWithoutTheCookieAsOneClosingRequest() {
    val h = harness()
    h.listener.allowTarget(target)
    h.send("GET", target, "Range: bytes=0-99", "Connection: keep-alive")
    val forwarded = String(h.take().second, Charsets.ISO_8859_1)
    assertEquals(raw("GET", target, "Range: bytes=0-99", "Connection: close"), forwarded)
    // Each seek or range is a fresh connection, admitted afresh against the same registration.
    h.send("HEAD", target)
    h.take()
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

  @Test fun aRegistrationIsBoundToTheMethodsItsShapeAllows() {
    val h = harness()
    h.listener.allowTarget(target)
    h.listener.allowTarget(upload)
    h.send("POST", upload, "Content-Type: image/png", "Content-Length: 0")
    h.take()
    h.send("GET", target)
    h.take()
    h.send("HEAD", target)
    h.take()
    // A GET asset URL does not admit a POST, and the signed upload URL does not admit a GET.
    for ((method, path) in listOf("POST" to target, "GET" to upload, "HEAD" to upload)) {
      val tcp = h.send(method, path, "Content-Length: 0")
      assertTrue("$method $path", h.isClosedByServer(tcp))
    }
    for (method in listOf("PUT", "DELETE", "PATCH", "CONNECT", "OPTIONS", "get", "TRACE")) {
      val tcp = h.send(method, target)
      assertTrue(method, h.isClosedByServer(tcp))
    }
    assertTrue(h.admitted.isEmpty())
  }

  @Test fun onlyTheShapesTheHostMintsCanBeRegistered() {
    val h = harness()
    val notShapes = listOf(
      "/",
      "/api/orchestration/dispatch",
      "/ws",
      "/api/assets",
      "/api/attachments/upload",
      "/.well-known/t3/environment",
      "//api/assets/x",
      "/api/assets/x/../../ws",
      "/api/assets/./x",
      "/api/assets/%2e%2E/ws"
    )
    for (path in notShapes) assertFalse(path, h.listener.allowTarget(path))
    val base = "http://127.0.0.1:${h.listener.port}"
    assertFalse(h.listener.allowUrl("$base/api/orchestration/dispatch"))
    assertTrue(h.listener.allowUrl("$base$target"))
    assertTrue(h.isClosedByServer(h.send("GET", "/api/orchestration/dispatch")))
  }

  @Test fun aPreviewBrowserDownloadIsRegistrableAsAReadAndNothingElseOnThatPathIs() {
    val h = harness()
    val download = "/api/preview-stream/download?id=d1&wsTicket=t1"
    val base = "http://127.0.0.1:${h.listener.port}"
    assertTrue(h.listener.allowUrl("$base$download"))
    h.send("GET", download)
    h.take()
    assertTrue(h.isClosedByServer(h.send("POST", download, "Content-Length: 0")))
    assertTrue(
      h.isClosedByServer(h.send("GET", "/api/preview-stream/download?id=d2&wsTicket=guess"))
    )
    for (path in listOf(
      "/api/preview-stream/download",
      "/api/preview-stream/ws?wsTicket=t",
      "/api/preview-stream/downloads?x=1"
    )) {
      assertFalse(path, h.listener.allowTarget(path))
    }
  }

  @Test fun aReplacedTunnelsUrlsAreNotAdmittedByItsSuccessor() {
    val revocations = CapabilityRevocations()
    fun tunnel() = Harness(limits, revocations = revocations).also { harnesses.add(it) }
    val first = tunnel()
    assertTrue(first.listener.allowTarget(target))
    first.listener.close()
    // Another app that bound the dead port captured the URL; replaying it on the new tunnel fails.
    val second = tunnel()
    assertFalse(second.listener.allowTarget(target))
    assertTrue(second.isClosedByServer(second.send("GET", target)))
    assertTrue(second.listener.allowTarget("/api/assets/fresh-token/f"))
    second.send("GET", "/api/assets/fresh-token/f")
    second.take()
    // The revocation lapses with the URL's own lifetime.
    now.addAndGet(limits.capabilityTtlMs * 1_000_000 + 1)
    assertTrue(second.listener.allowTarget(target))
  }

  @Test fun expiryFollowsTheInjectedElapsedClockNotWallTime() {
    val h = harness(limits.copy(capabilityTtlMs = 3_600_000))
    h.listener.allowTarget(target)
    // A night of deep sleep advances elapsed time by hours between two requests.
    now.addAndGet(3_599_000_000_000L)
    h.send("GET", target)
    h.take()
    now.addAndGet(2_000_000_000L)
    assertTrue(h.isClosedByServer(h.send("GET", target)))
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
    val h = harness(limits.copy(maxCapabilities = 6))
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

  @Test fun onlyOriginFormTargetsNormalize() {
    assertEquals("/api/assets/t/f", NexiCapabilityTargets.normalize("/api/assets/t/f"))
    for (raw in listOf(
      "//evil.example/api/assets/t/f",
      "//",
      "api/assets/t/f",
      "*",
      "http://127.0.0.1/api/assets/t/f",
      "/api/assets/t/f#frag",
      "/api/assets/t/ f",
      ""
    )) {
      assertNull(raw, NexiCapabilityTargets.normalize(raw))
    }
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
