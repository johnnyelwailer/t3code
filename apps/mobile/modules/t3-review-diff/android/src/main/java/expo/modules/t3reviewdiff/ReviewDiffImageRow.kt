package expo.modules.t3reviewdiff

import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.RectF
import org.json.JSONObject
import kotlin.math.min

internal const val IMAGE_ROW_HEIGHT_DP = 240f
private const val PANEL_GAP_DP = 8f
private const val PANEL_PADDING_DP = 12f
private const val LABEL_HEIGHT_DP = 22f
private const val PANEL_RADIUS_DP = 6f

/** Each side's panel, left to right, inside an image row. */
internal fun imagePanels(
  sides: List<String>,
  top: Int,
  bottom: Int,
  width: Int,
  density: Float
): List<Pair<String, RectF>> {
  if (sides.isEmpty()) return emptyList()
  val padding = PANEL_PADDING_DP * density
  val gap = PANEL_GAP_DP * density
  val panelWidth = (width - padding * 2 - gap * (sides.size - 1)) / sides.size
  return sides.mapIndexed { index, side ->
    val left = padding + index * (panelWidth + gap)
    side to RectF(left, top + padding, left + panelWidth, bottom - padding)
  }
}

internal fun imageSideAt(sides: List<String>, x: Float, width: Int, density: Float): String? =
  imagePanels(sides, 0, 1, width, density).firstOrNull { (_, rect) ->
    x >= rect.left && x <= rect.right
  }?.first

internal fun parseImageUris(value: String): Map<String, Map<String, String>> = try {
  val json = JSONObject(value)
  json.keys().asSequence().associateWith { rowId ->
    val sides = json.optJSONObject(rowId) ?: JSONObject()
    sides.keys().asSequence().associateWith { side -> sides.optString(side) }
  }
} catch (_: Exception) {
  emptyMap()
}

internal class ReviewDiffImageRowDrawing(private val density: Float) {
  private val panelPaint = Paint(Paint.ANTI_ALIAS_FLAG)
  private val bitmapPaint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)

  fun draw(
    canvas: Canvas,
    panels: List<Pair<String, RectF>>,
    states: List<ReviewDiffImageState>,
    theme: DiffTheme,
    labelPaint: Paint
  ) {
    val labelHeight = if (panels.size > 1) LABEL_HEIGHT_DP * density else 0f
    panels.forEachIndexed { index, (side, panel) ->
      panelPaint.color = theme.hunkBackground
      canvas.drawRoundRect(panel, PANEL_RADIUS_DP * density, PANEL_RADIUS_DP * density, panelPaint)
      if (labelHeight > 0f) {
        labelPaint.color = if (side == "old") theme.deleteText else theme.addText
        canvas.drawText(
          if (side == "old") "Before" else "After",
          panel.left + PANEL_PADDING_DP * density,
          panel.top + labelHeight * 0.75f,
          labelPaint,
        )
      }
      val area = RectF(panel.left, panel.top + labelHeight, panel.right, panel.bottom)
      area.inset(PANEL_PADDING_DP * density / 2f, PANEL_PADDING_DP * density / 2f)
      when (val state = states.getOrNull(index)) {
        is ReviewDiffImageState.Ready -> drawFitted(canvas, state, area)
        ReviewDiffImageState.Unavailable ->
          drawCaption(
            canvas,
            "Preview unavailable",
            area,
            theme,
            labelPaint,
          )
        else -> drawCaption(canvas, "Loading image…", area, theme, labelPaint)
      }
    }
  }

  private fun drawFitted(canvas: Canvas, state: ReviewDiffImageState.Ready, area: RectF) {
    val bitmap = state.bitmap
    val scale = min(1f * density, min(area.width() / bitmap.width, area.height() / bitmap.height))
    val drawWidth = bitmap.width * scale
    val drawHeight = bitmap.height * scale
    val left = area.centerX() - drawWidth / 2f
    val top = area.centerY() - drawHeight / 2f
    canvas.drawBitmap(
      bitmap,
      Rect(0, 0, bitmap.width, bitmap.height),
      RectF(left, top, left + drawWidth, top + drawHeight),
      bitmapPaint,
    )
  }

  private fun drawCaption(
    canvas: Canvas,
    text: String,
    area: RectF,
    theme: DiffTheme,
    paint: Paint,
  ) {
    paint.color = theme.mutedText
    val textWidth = paint.measureText(text)
    val metrics = paint.fontMetrics
    canvas.drawText(
      text,
      area.centerX() - textWidth / 2f,
      area.centerY() - (metrics.ascent + metrics.descent) / 2f,
      paint,
    )
  }
}
