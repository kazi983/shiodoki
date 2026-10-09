package dev.kaorukajihara.shiodoki.ui.components

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.addPathNodes
import androidx.compose.ui.unit.dp

/**
 * An icon from the design canvas's SVG paths (24×24 viewBox, 2px stroke, round caps), for icons
 * that `material-icons-core` does not have. Tinted by `Icon` like any other icon.
 */
fun strokeIcon(name: String, vararg paths: String): ImageVector =
  ImageVector.Builder(name, 24.dp, 24.dp, 24f, 24f).apply {
    paths.forEach {
      addPath(
        pathData = addPathNodes(it),
        stroke = SolidColor(Color.Black),
        strokeLineWidth = 2f,
        strokeLineCap = StrokeCap.Round,
        strokeLineJoin = StrokeJoin.Round,
      )
    }
  }.build()
