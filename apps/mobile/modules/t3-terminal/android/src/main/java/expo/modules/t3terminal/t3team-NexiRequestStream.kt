// Fork files use the t3team- prefix, which is not a Kotlin class identifier.
@file:Suppress("ktlint:standard:filename", "MatchingDeclarationName")

package expo.modules.t3terminal

import java.io.ByteArrayOutputStream
import java.io.IOException
import java.io.InputStream
import java.nio.charset.StandardCharsets

private enum class Stage { HEAD, BODY, CHUNK_SIZE, CHUNK_DATA, CHUNK_END, TRAILERS, RAW, DONE }

/**
 * The client-to-host bytes of a loopback connection, one HTTP request at a time. Each request head
 * goes to `plan`, which refuses it or says how to rewrite and frame it; bodies are copied through by
 * Content-Length or chunk framing without being inspected, so a body that contains a request line
 * stays a body. An upgraded connection becomes a raw pipe after its request, so the WebSocket data
 * path is never parsed. After a `last` request any further byte is refused. On a refusal
 * `onRefused` gets a fixed reason, nothing of the packet is forwarded and the read fails, which ends
 * the connection.
 */
class RequestStream(
  private val source: InputStream,
  initial: ByteArray,
  private val plan: (String) -> RequestPlan,
  private val onRefused: (String) -> Unit
) : InputStream() {
  private val head = ByteArrayOutputStream()
  private val line = StringBuilder()
  private val ready = ArrayDeque<ByteArray>()
  private var offset = 0
  private var stage = Stage.HEAD
  private var left = 0L
  private var trailerBytes = 0
  private var lastFour = 0
  private var current = RequestPlan()
  private var pendingInitial: ByteArray? = initial

  override fun read(): Int {
    val one = ByteArray(1)
    return if (read(one, 0, 1) < 0) -1 else one[0].toInt() and 0xff
  }

  override fun read(buffer: ByteArray, off: Int, len: Int): Int {
    var eof = false
    while (ready.isEmpty() && !eof) {
      val chunk = pendingInitial ?: ByteArray(CHUNK).let { it.copyOf(maxOf(source.read(it), 0)) }
      eof = pendingInitial == null && chunk.isEmpty()
      pendingInitial = null
      if (!eof) feed(chunk)
    }
    if (ready.isEmpty()) return -1
    val next = ready.first()
    val count = minOf(len, next.size - offset)
    next.copyInto(buffer, off, offset, offset + count)
    offset += count
    if (offset == next.size) {
      ready.removeFirst()
      offset = 0
    }
    return count
  }

  override fun close() = source.close()

  private fun feed(bytes: ByteArray) {
    val out = ByteArrayOutputStream()
    var index = 0
    while (index < bytes.size) index += step(bytes, index, out)
    if (out.size() > 0) ready.addLast(out.toByteArray())
  }

  /** Handles the bytes from `index` that belong to the current stage; returns how many it used. */
  private fun step(bytes: ByteArray, index: Int, out: ByteArrayOutputStream): Int = when (stage) {
    Stage.RAW -> (bytes.size - index).also { out.write(bytes, index, it) }
    Stage.DONE -> refuse("extra-bytes")
    Stage.BODY, Stage.CHUNK_DATA -> data(bytes, index).also { out.write(bytes, index, it) }
    Stage.HEAD -> headByte(bytes[index], out)
    else -> {
      out.write(bytes[index].toInt())
      framingByte(bytes[index])
    }
  }

  private fun data(bytes: ByteArray, index: Int): Int {
    val take = minOf(left, (bytes.size - index).toLong()).toInt()
    left -= take
    if (left == 0L) stage = if (stage == Stage.BODY) endRequest() else Stage.CHUNK_END
    return take
  }

  private fun headByte(byte: Byte, out: ByteArrayOutputStream): Int {
    lastFour = (lastFour shl 8) or (byte.toInt() and 0xff)
    head.write(byte.toInt())
    if (head.size() > NexiLoopbackAuth.MAX_HEAD_BYTES) refuse("head-too-large")
    if (lastFour == HEAD_END) finishHead(out)
    return 1
  }

  private fun finishHead(out: ByteArrayOutputStream) {
    val raw = head.toByteArray()
    head.reset()
    lastFour = 0
    current = plan(String(raw, 0, raw.size - 4, StandardCharsets.ISO_8859_1))
    current.reason?.let { refuse(it) }
    out.write(current.rewrite(raw))
    left = current.length
    stage = when {
      current.raw -> Stage.RAW
      current.chunked -> Stage.CHUNK_SIZE
      left > 0 -> Stage.BODY
      else -> endRequest()
    }
  }

  private fun endRequest() = if (current.last) Stage.DONE else Stage.HEAD

  /** One byte of chunk framing (size line, the CRLF after data, trailers); forwarded verbatim. */
  private fun framingByte(byte: Byte): Int {
    val char = (byte.toInt() and 0xff).toChar()
    if (stage == Stage.CHUNK_END) {
      line.append(char)
      if (line.length == 2) {
        if (line.toString() != "\r\n") refuse("bad-chunk")
        line.setLength(0)
        stage = Stage.CHUNK_SIZE
      }
    } else {
      line.append(char)
      trailerBytes += if (stage == Stage.TRAILERS) 1 else 0
      if (line.length > MAX_LINE ||
        trailerBytes > NexiLoopbackAuth.MAX_HEAD_BYTES
      ) {
        refuse("bad-chunk")
      }
      if (line.endsWith("\r\n")) endLine(line.substring(0, line.length - 2))
    }
    return 1
  }

  private fun endLine(text: String) {
    line.setLength(0)
    if (stage == Stage.CHUNK_SIZE) {
      val size = text.substringBefore(';').trim()
      if (!HEX.matches(size)) refuse("bad-chunk")
      left = size.toLong(16)
      trailerBytes = 0
      stage = if (left == 0L) Stage.TRAILERS else Stage.CHUNK_DATA
    } else if (text.isEmpty()) {
      stage = endRequest()
    } else if (text.startsWith(" ") || text.startsWith("\t")) {
      refuse("bad-chunk")
    }
  }

  private fun refuse(reason: String): Nothing {
    onRefused(reason)
    throw IOException("The loopback request was refused")
  }

  private companion object {
    const val CHUNK = 64 * 1024
    const val MAX_LINE = 1024
    const val HEAD_END = 0x0d0a0d0a
    val HEX = Regex("[0-9a-fA-F]{1,15}")
  }
}
