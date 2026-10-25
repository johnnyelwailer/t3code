// Fork files use the t3team- prefix, which is not a Kotlin class identifier.
@file:Suppress("ktlint:standard:filename", "MatchingDeclarationName")

package expo.modules.t3terminal

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.net.InetAddress
import java.net.ServerSocket
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
  private val tunnels = ConcurrentHashMap<String, Tunnel>()
  private val tokens = ConcurrentHashMap<String, CompletableFuture<String>>()

  override fun definition() = ModuleDefinition {
    Name("NexiBroker")
    Events("tokenRequested")
    AsyncFunction("start") { session: String, streamUrl: String ->
      require(streamUrl.startsWith("wss://")) { "The broker requires TLS" }
      synchronized(tunnels) {
        tunnels[session]?.server?.localPort ?: Tunnel(streamUrl).also {
          tunnels[session] = it
          it.accept()
        }.server.localPort
      }
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

  private fun closeAll() {
    synchronized(tunnels) {
      tunnels.values.forEach { it.close() }
      tunnels.clear()
      tokens.values.forEach { it.cancel(true) }
      tokens.clear()
    }
  }

  private inner class Tunnel(private val streamUrl: String) {
    val server = ServerSocket(0, 16, InetAddress.getByName("127.0.0.1"))
    private val sockets = ConcurrentHashMap<Socket, Boolean>()
    private val streams = ConcurrentHashMap<WebSocket, Boolean>()

    fun accept() {
      // A dedicated accept thread never consumes a worker needed by an active stream.
      Thread({
        try {
          while (!server.isClosed) {
            val tcp = server.accept()
            if (sockets.size >= 16) {
              tcp.close()
            } else {
              sockets[tcp] = true
              workers.execute { pipe(tcp) }
            }
          }
        } catch (_: Exception) {
          close()
        }
      }, "nexi-broker-accept").start()
    }

    private fun pipe(tcp: Socket) {
      var ws: WebSocket? = null
      val requestId = UUID.randomUUID().toString()
      try {
        val token = CompletableFuture<String>()
        tokens[requestId] = token
        sendEvent("tokenRequested", mapOf("requestId" to requestId))
        val bearer = token.get(30, TimeUnit.SECONDS)
        if (server.isClosed) return
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
        val input = tcp.getInputStream()
        var count = input.read(buffer)
        while (count >= 0 && !tcp.isClosed && !server.isClosed) {
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
        tcp.close()
        sockets.remove(tcp)
      }
    }

    fun close() {
      server.close()
      sockets.keys.forEach { it.close() }
      streams.keys.forEach { it.cancel() }
    }
  }
}
