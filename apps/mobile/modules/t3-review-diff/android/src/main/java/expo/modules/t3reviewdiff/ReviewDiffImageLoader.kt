package expo.modules.t3reviewdiff

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Handler
import android.os.Looper
import android.util.LruCache
import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

private const val CACHE_BYTES = 48 * 1024 * 1024
private const val MAX_IMAGE_BYTES = 20 * 1024 * 1024
private const val MAX_DECODED_EDGE = 1600
private const val TIMEOUT_MS = 30_000

/** Fetches and decodes the signed asset URLs of image rows off the main thread. */
internal class ReviewDiffImageLoader(private val onLoaded: () -> Unit) {
  private val executor = Executors.newFixedThreadPool(2)
  private val mainHandler = Handler(Looper.getMainLooper())
  private val pending = mutableSetOf<String>()
  private val failed = mutableSetOf<String>()
  private val cache = object : LruCache<String, Bitmap>(CACHE_BYTES) {
    override fun sizeOf(key: String, value: Bitmap): Int = value.allocationByteCount
  }

  fun state(url: String?): ReviewDiffImageState {
    val cached = url?.let { cache.get(it) }
    return when {
      url == null -> ReviewDiffImageState.Loading
      cached != null -> ReviewDiffImageState.Ready(cached)
      failed.contains(url) -> ReviewDiffImageState.Unavailable
      else -> startLoad(url)
    }
  }

  private fun startLoad(url: String): ReviewDiffImageState {
    if (pending.add(url)) executor.execute { load(url) }
    return ReviewDiffImageState.Loading
  }

  fun shutdown() {
    executor.shutdownNow()
    cache.evictAll()
  }

  private fun load(url: String) {
    val bitmap = runCatching { decode(fetch(url)) }.getOrNull()
    mainHandler.post {
      pending.remove(url)
      if (bitmap == null) failed.add(url) else cache.put(url, bitmap)
      onLoaded()
    }
  }

  private fun fetch(url: String): ByteArray {
    val connection = URL(url).openConnection() as HttpURLConnection
    connection.connectTimeout = TIMEOUT_MS
    connection.readTimeout = TIMEOUT_MS
    try {
      check(connection.responseCode in 200..299)
      return connection.inputStream.use { readCapped(it) }
    } finally {
      connection.disconnect()
    }
  }

  private fun readCapped(input: InputStream): ByteArray {
    val output = ByteArrayOutputStream()
    val buffer = ByteArray(64 * 1024)
    while (true) {
      val read = input.read(buffer)
      if (read < 0) break
      output.write(buffer, 0, read)
      check(output.size() <= MAX_IMAGE_BYTES)
    }
    return output.toByteArray()
  }

  private fun decode(bytes: ByteArray): Bitmap? {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
    var sampleSize = 1
    while (maxOf(bounds.outWidth, bounds.outHeight) / (sampleSize * 2) >= MAX_DECODED_EDGE) {
      sampleSize *= 2
    }
    val options = BitmapFactory.Options().apply { inSampleSize = sampleSize }
    return BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options)
  }
}

internal sealed interface ReviewDiffImageState {
  data object Loading : ReviewDiffImageState
  data object Unavailable : ReviewDiffImageState
  data class Ready(val bitmap: Bitmap) : ReviewDiffImageState
}
