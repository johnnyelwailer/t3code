// Fork files use the t3team- prefix, which is not a Kotlin class identifier.
@file:Suppress("ktlint:standard:filename", "MatchingDeclarationName")

package expo.modules.t3terminal

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

private fun head(vararg lines: String) = (listOf("GET / HTTP/1.1") + lines).joinToString("\r\n")

private fun forwarded(raw: String) =
  String(NexiLoopbackHead.sanitize(raw.toByteArray(Charsets.ISO_8859_1)), Charsets.ISO_8859_1)

class NexiLoopbackHeadTest {
  @Test fun credentialsAreOnlyReadFromTheHeadOfTheRightPort() {
    val parsed = NexiLoopbackHead.parse(
      head("Cookie: t3lb1=aa; t3lb2=bb; t3lb22=cc", "x-t3-loopback: dd", "X-Other: t3lb2=ee"),
      2
    )
    assertEquals(listOf("dd", "bb"), parsed.credentials)
    assertEquals(
      listOf("dd", "cc"),
      NexiLoopbackHead.parse(head("Cookie: t3lb22=cc", "X-T3-Loopback: dd"), 22).credentials
    )
    assertEquals(
      emptyList<String>(),
      NexiLoopbackHead.parse("GET /t3lb2=ff HTTP/1.1", 2).credentials
    )
  }

  @Test fun originTable() {
    fun allowed(vararg lines: String) =
      NexiLoopbackHead.originAllowed(NexiLoopbackHead.parse(head(*lines), 4100), 4100)
    assertTrue(allowed())
    assertTrue(allowed("Origin: http://127.0.0.1:4100"))
    assertTrue(allowed("Sec-Fetch-Site: same-origin"))
    assertTrue(allowed("Sec-Fetch-Site: none"))
    assertFalse(allowed("Origin: http://127.0.0.1:4101"))
    assertFalse(allowed("Origin: http://127.0.0.1:4100/"))
    assertFalse(allowed("Origin: null"))
    assertFalse(allowed("Origin: https://localhost"))
    assertFalse(allowed("Origin: http://127.0.0.1"))
    assertFalse(allowed("Sec-Fetch-Site: cross-site"))
    assertFalse(allowed("Sec-Fetch-Site: same-site"))
  }

  @Test fun ambiguousHeadsAreMarkedMalformed() {
    fun malformed(vararg lines: String) = NexiLoopbackHead.parse(head(*lines), 1).malformed
    assertNull(malformed("Cookie: a=b", "Host: x"))
    assertEquals("folded-header", malformed("Cookie: a=b", " more"))
    assertEquals("folded-header", malformed("Cookie: a=b", "\tmore"))
    assertEquals("duplicate-cookie", malformed("Cookie: a=b", "cookie: c=d"))
    assertEquals("duplicate-origin", malformed("Origin: a", "ORIGIN: b"))
    assertEquals(
      "duplicate-sec-fetch-site",
      malformed("Sec-Fetch-Site: none", "sec-fetch-site: none")
    )
  }

  @Test fun sanitizeRemovesOnlyLoopbackCredentials() {
    assertEquals(
      "GET / HTTP/1.1\r\nHost: a\r\nCookie: theme=dark; sid=1\r\n\r\nbody t3lb9=x",
      forwarded(
        head("Host: a", "Cookie: t3lb9=s; theme=dark; t3lb10=t; sid=1") + "\r\n\r\nbody t3lb9=x"
      )
    )
    // A Cookie header that held only loopback cookies is dropped, as is the explicit header.
    assertEquals(
      "GET / HTTP/1.1\r\nHost: a\r\n\r\n",
      forwarded(
        head("Host: a", "Cookie: t3lb9=s", "X-T3-Loopback: s", "x-t3-loopback: t") + "\r\n\r\n"
      )
    )
    val untouched = head("Host: a", "Accept: */*") + "\r\n\r\n"
    assertEquals(untouched, forwarded(untouched))
    // An incomplete head is returned as is: it is never forwarded before admission.
    assertEquals(
      "GET / HTTP/1.1\r\nCookie: t3lb9=s",
      forwarded("GET / HTTP/1.1\r\nCookie: t3lb9=s")
    )
  }

  @Test fun sanitizeKeepsNonTextBytesAfterTheHeadIntact() {
    val tail = byteArrayOf(0, -1, -128, 127, 13, 10, 13, 10)
    val raw = (head("Cookie: t3lb9=s") + "\r\n\r\n").toByteArray(Charsets.ISO_8859_1) + tail
    val out = NexiLoopbackHead.sanitize(raw)
    assertEquals(tail.toList(), out.takeLast(tail.size))
  }

  @Test fun staleCookieNamesAreOnlyTheLoopbackOnes() {
    assertEquals(
      listOf("t3lb1", "t3lb22"),
      NexiLoopbackHead.staleCookieNames("sid=1; t3lb1=aa; theme=dark; t3lb22=")
    )
    assertEquals(emptyList<String>(), NexiLoopbackHead.staleCookieNames(null))
    assertEquals(emptyList<String>(), NexiLoopbackHead.staleCookieNames(""))
  }

  @Test fun streamPolicyPinsOriginPathAndSessionQuery() {
    val pinned = "https://broker.example"
    val ok = "wss://broker.example/v1/client/stream?session=h-abc_1"
    assertNull(NexiStreamPolicy.refusal(ok, pinned))
    assertNull(
      NexiStreamPolicy.refusal(
        "wss://broker.example:443/v1/client/stream?session=a",
        "https://broker.example:443"
      )
    )
    val refused = listOf(
      "ws://broker.example/v1/client/stream?session=a",
      "https://broker.example/v1/client/stream?session=a",
      "wss://evil.example/v1/client/stream?session=a",
      "wss://broker.example.evil.example/v1/client/stream?session=a",
      "wss://broker.example:8443/v1/client/stream?session=a",
      "wss://user:pw@broker.example/v1/client/stream?session=a",
      "wss://broker.example/v1/client/stream?session=a#f",
      "wss://broker.example/v1/other?session=a",
      "wss://broker.example/v1/client/stream",
      "wss://broker.example/v1/client/stream?session=a&x=1",
      "wss://broker.example/v1/client/stream?session=../a",
      "wss://broker.example/v1/client/stream?session=",
      "not a url",
      ""
    )
    for (url in refused) assertTrue(url, NexiStreamPolicy.refusal(url, pinned) != null)
  }

  @Test fun streamPolicyFailsClosedWithoutAConfiguredHttpsOrigin() {
    val url = "wss://broker.example/v1/client/stream?session=a"
    for (pinned in listOf(
      null,
      "",
      "http://broker.example",
      "https://broker.example/path",
      "garbage"
    )) {
      assertTrue(pinned.toString(), NexiStreamPolicy.refusal(url, pinned) != null)
    }
  }
}
