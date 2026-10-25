// Fork files use the t3team- prefix, which is not a Kotlin class identifier.
@file:Suppress("ktlint:standard:filename", "MatchingDeclarationName")

package expo.modules.t3terminal

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import android.content.pm.PackageManager
import android.os.SystemClock
import android.util.Log
import android.webkit.CookieManager
import java.io.InputStream
import java.net.Socket
import java.util.UUID
import java.util.concurrent.CompletableFuture
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString
import okio.ByteString.Companion.toByteString

/** Android equivalent of NexiBrokerForwarder: one broker stream per loopback TCP connection. */
class NexiBrokerModule : Module() {
  private val client = OkHttpClient.Builder().readTimeout(0, TimeUnit.MILLISECONDS).build()
  private val workers = Executors.newFixedThreadPool(32)
  private val tunnels: NexiTunnelRegistry<Tunnel> = NexiTunnelRegistry { it.isClosed }
  private val tokens = ConcurrentHashMap<String, CompletableFuture<String>>()

  override fun definition() = ModuleDefinition {
    Name("NexiBroker")
    Events("tokenRequested")
    OnCreate { clearStaleCredentials() }
    AsyncFunction("start") { session: String, streamUrl: String ->
      val refusal = NexiStreamPolicy.refusal(streamUrl, pinnedBrokerOrigin())
      require(refusal == null) { refusal.orEmpty() }
      val acquired = tunnels.acquire(session) { Tunnel(session, streamUrl) }
      // Delivered on every start, including reuse: it repairs a cleared cookie jar. The secret
      // stays native; JS only ever sees the bare loopback port.
      acquired.tunnel.deliverSecret()
      if (acquired.fresh) acquired.tunnel.listener.start()
      acquired.tunnel.listener.port
    }
    // Native HTTP clients (downloads, uploads, image and media loaders) cannot send the loopback
    // cookie. JS registers each signed URL it hands them; only that exact request is admitted.
    Function("allowRequest") { url: String ->
      tunnels.snapshot().any { !it.isClosed && it.listener.allowUrl(url) }
    }
    Function("provideToken") { requestId: String, token: String? ->
      tokens.remove(requestId)?.let {
        if (token.isNullOrBlank()) {
          it.completeExceptionally(IllegalStateException("Sign in again"))
        } else {
          it.complete(token)
        }
      }
    }
    Function("closeAll") { closeAll() }
    OnDestroy {
      closeAll()
      workers.shutdownNow()
      client.dispatcher.executorService.shutdown()
      client.connectionPool.evictAll()
    }
  }

  /** The https broker origin the build was configured with (manifest meta-data), if any. */
  private fun pinnedBrokerOrigin(): String? = try {
    val context = appContext.reactContext
    context?.packageManager
      ?.getApplicationInfo(context.packageName, PackageManager.GET_META_DATA)
      ?.metaData?.getString(BROKER_ORIGIN_KEY)
  } catch (_: PackageManager.NameNotFoundException) {
    null
  }

  /** A previous process's `t3lb*` cookies authorize nothing, but should not outlive it. */
  private fun clearStaleCredentials() {
    try {
      val manager = CookieManager.getInstance()
      val stale = NexiLoopbackHead.staleCookieNames(manager.getCookie("http://127.0.0.1/"))
      stale.forEach { manager.setCookie("http://127.0.0.1/", "$it=; Path=/; Max-Age=0") }
    } catch (_: RuntimeException) {
      // No WebView provider: there is no cookie jar to clear.
    }
  }

  private fun closeAll() {
    tunnels.drain().forEach { it.close() }
    tokens.values.forEach { it.cancel(true) }
    tokens.clear()
  }

  private inner class Tunnel(private val session: String, private val streamUrl: String) {
    private val secret: String = NexiLoopbackAuth.newSecret()

    // Explicit types: `tunnels` needs `isClosed`, which needs `listener`, whose callbacks use `tunnels`.
    val listener: NexiLoopbackListener = NexiLoopbackListener(
      secret = secret,
      onAdmitted = { tcp, input -> workers.execute { pipe(tcp, input) } },
      securityLog = { Log.w("NexiBroker", it) },
      onClosed = {
        revokeSecret()
        tunnels.remove(session, this)
      },
      // Elapsed realtime keeps counting in deep sleep; the host's asset tokens expire by wall clock.
      limits = LoopbackLimits(nanoTime = { SystemClock.elapsedRealtimeNanos() })
    )
    private val streams = ConcurrentHashMap<WebSocket, Boolean>()
    val isClosed: Boolean get() = listener.isClosed

    /** The app's own cookie jar, so every in-app HTTP, WebSocket and WebView client sends it. */
    private val cookieUrl: String get() = "http://127.0.0.1:${listener.port}/"

    fun deliverSecret() {
      try {
        val cookie = "${NexiLoopbackAuth.cookieName(
          listener.port
        )}=$secret; Path=/; HttpOnly; SameSite=Strict"
        CookieManager.getInstance().setCookie(cookieUrl, cookie)
      } catch (_: RuntimeException) {
        // Fail closed: without the cookie no client could connect, and the cause may name the secret.
        close()
        error("The loopback credential could not be installed")
      }
    }

    private fun revokeSecret() {
      try {
        val expired = "${NexiLoopbackAuth.cookieName(listener.port)}=; Path=/; Max-Age=0"
        CookieManager.getInstance().setCookie(cookieUrl, expired)
      } catch (_: RuntimeException) {
        // The secret dies with the listener regardless; a stale cookie authorizes nothing.
      }
    }

    private fun pipe(tcp: Socket, input: InputStream) {
      var ws: WebSocket? = null
      val requestId = UUID.randomUUID().toString()
      try {
        val token = CompletableFuture<String>()
        tokens[requestId] = token
        sendEvent("tokenRequested", mapOf("requestId" to requestId))
        val bearer = token.get(30, TimeUnit.SECONDS)
        if (listener.isClosed) return
        val opened = CompletableFuture<Unit>()
        val request = Request.Builder().url(
          streamUrl
        ).header("Authorization", "Bearer $bearer").build()
        ws = client.newWebSocket(
          request,
          object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
              opened.complete(Unit)
            }

            override fun onMessage(webSocket: WebSocket, bytes: ByteString) {
              if (bytes.size > 16 * 1024 * 1024) {
                webSocket.cancel()
                tcp.close()
                return
              }
              try {
                tcp.getOutputStream().write(bytes.toByteArray())
              } catch (_: Exception) {
                webSocket.cancel()
                tcp.close()
              }
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
              opened.completeExceptionally(t)
              tcp.close()
            }

            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
              webSocket.close(code, null)
              tcp.close()
            }
          }
        )
        streams[ws] = true
        opened.get(30, TimeUnit.SECONDS)
        val buffer = ByteArray(64 * 1024)
        var count = input.read(buffer)
        while (count >= 0 && !tcp.isClosed && !listener.isClosed) {
          while (ws.queueSize() >= 1024 * 1024 && !tcp.isClosed) Thread.sleep(20)
          if (!ws.send(buffer.toByteString(0, count))) break
          count = input.read(buffer)
        }
      } catch (_: Exception) {
        // Closing the local socket surfaces failures through the shared connection supervisor.
      } finally {
        tokens.remove(requestId)?.cancel(true)
        ws?.let {
          streams.remove(it)
          it.cancel()
        }
        listener.release(tcp)
      }
    }

    fun close() {
      listener.close()
      streams.keys.forEach { it.cancel() }
    }
  }
}

private const val BROKER_ORIGIN_KEY = "com.nexplore.nexiwork.NEXI_BROKER_ORIGIN"
