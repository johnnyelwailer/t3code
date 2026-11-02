package expo.modules.t3reviewdiff

import android.graphics.Canvas
import android.graphics.Paint

/** Image rows of the review diff: loads each side's bitmap off the main thread and draws its panel. */
internal class ReviewDiffImages(
  private val density: Float,
  private val onChanged: () -> Unit
) {
  private val loader = ReviewDiffImageLoader(onChanged)
  private val drawing = ReviewDiffImageRowDrawing(density)
  private var rowUris: Map<String, Map<String, String>> = emptyMap()

  fun setUris(value: Map<String, Map<String, String>>) {
    rowUris = value
    onChanged()
  }

  fun release() {
    loader.shutdown()
  }

  fun drawRow(
    canvas: Canvas,
    row: DiffRow,
    top: Int,
    bottom: Int,
    width: Int,
    theme: DiffTheme,
    labelPaint: Paint
  ) {
    val panels = imagePanels(row.imageSides, top, bottom, width, density)
    val uris = rowUris[row.id]
    drawing.draw(
      canvas,
      panels,
      panels.map { (side) -> loader.state(uris?.get(side)) },
      theme,
      labelPaint,
    )
  }
}
