package dev.kaorukajihara.shiodoki.ui.home

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.addPathNodes
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.kaorukajihara.shiodoki.ui.components.Dot
import dev.kaorukajihara.shiodoki.ui.theme.MonoFamily
import dev.kaorukajihara.shiodoki.ui.theme.ShiodokiColors
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/** The PC status card of the home screen (design §5.3, the "PC の状況カード" artboard). */
@Composable
fun PcStatusCard(status: PcStatus, modifier: Modifier = Modifier) {
  when (status) {
    is PcStatus.Running -> RunningCard(status, modifier)
    PcStatus.Choosing -> StatusCard(
      icon = Icons.List,
      title = "タスクを選んでいます",
      detail = { append("選択画面を表示中") },
      modifier = modifier,
    )
    is PcStatus.Snoozed -> StatusCard(
      icon = Icons.Snooze,
      title = "スヌーズ中",
      detail = {
        if (status.nextPromptAt == null) {
          append("もうすぐタスク選択")
        } else {
          time(status.nextPromptAt)
          append(" にもう一度タスク選択")
        }
      },
      modifier = modifier,
    )
    PcStatus.LeaveBlocked -> StatusCard(
      icon = Icons.Stop,
      title = "停止中",
      detail = { append("離席時刻が近いため作業を止めています") },
      modifier = modifier,
    )
    is PcStatus.Offline -> StatusCard(
      icon = Icons.Offline,
      title = "PC オフライン",
      detail = {
        if (status.lastSeen != null) {
          append("最終確認 ")
          time(status.lastSeen)
          append(" · ")
        }
        append("スリープ・通信断・異常終了")
      },
      modifier = modifier,
      inactive = true,
    )
    is PcStatus.Stopped -> StatusCard(
      icon = Icons.Power,
      title = "アプリ終了",
      detail = {
        if (status.stoppedAt != null) {
          append("終了時刻 ")
          time(status.stoppedAt)
        } else {
          append("PC のアプリは終了しています")
        }
      },
      modifier = modifier,
      inactive = true,
    )
    PcStatus.NoData -> StatusCard(
      icon = Icons.Power,
      title = "情報がありません",
      detail = { append("PC のアプリで同じアカウントにログインすると表示されます") },
      modifier = modifier,
      inactive = true,
    )
  }
}

@Composable
private fun RunningCard(status: PcStatus.Running, modifier: Modifier) {
  CardFrame(modifier, ShiodokiColors.SurfaceRaised) {
    ProgressRing(status.remainingMinutes, status.totalMinutes)
    Column(Modifier.weight(1f)) {
      Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        Dot(ShiodokiColors.Accent, 6)
        Text("PC で実行中", fontSize = 12.sp, color = ShiodokiColors.TextMuted)
      }
      Title(status.taskName)
      Detail {
        if (status.startedAt != null) {
          time(status.startedAt)
          append(" 開始")
        }
        if (status.elapsedMinutes != null) append(" · ${status.elapsedMinutes}分経過")
      }
    }
  }
}

/** Every state but running: an icon in an empty ring, "PC", a title and a detail line. */
@Composable
private fun StatusCard(
  icon: ImageVector,
  title: String,
  detail: AnnotatedBuilder,
  modifier: Modifier,
  inactive: Boolean = false,
) {
  val background = if (inactive) Color.Transparent else ShiodokiColors.Surface
  CardFrame(modifier, background, dashed = inactive) {
    Box(
      Modifier.size(RING_SIZE).drawBehind {
        val stroke = RING_STROKE.toPx()
        drawCircle(
          color = ShiodokiColors.Outline,
          radius = (size.minDimension - stroke) / 2,
          style = Stroke(
            width = stroke,
            pathEffect = if (inactive) PathEffect.dashPathEffect(floatArrayOf(10f, 8f)) else null,
          ),
        )
      },
      contentAlignment = Alignment.Center,
    ) {
      Icon(
        icon,
        contentDescription = null,
        tint = if (inactive) ShiodokiColors.TextMuted else ShiodokiColors.Text,
        modifier = Modifier.size(20.dp),
      )
    }
    Column(Modifier.weight(1f)) {
      Text("PC", fontSize = 12.sp, color = ShiodokiColors.TextMuted)
      Title(title, color = if (inactive) ShiodokiColors.Text else ShiodokiColors.TextStrong)
      Detail(detail)
    }
  }
}

@Composable
private fun CardFrame(
  modifier: Modifier,
  background: Color,
  dashed: Boolean = false,
  content: @Composable RowScope.() -> Unit,
) {
  Row(
    modifier = modifier
      .fillMaxWidth()
      .clip(CARD_SHAPE)
      .background(background)
      .then(if (dashed) Modifier.dashedBorder() else Modifier)
      .semantics(mergeDescendants = true) {}
      .padding(20.dp),
    verticalAlignment = Alignment.CenterVertically,
    horizontalArrangement = Arrangement.spacedBy(14.dp),
    content = content,
  )
}

@Composable
private fun Title(text: String, color: Color = ShiodokiColors.TextStrong) {
  Text(
    text,
    fontSize = 16.sp,
    fontWeight = FontWeight.Bold,
    color = color,
    maxLines = 1,
    overflow = TextOverflow.Ellipsis,
  )
}

private typealias AnnotatedBuilder = AnnotatedString.Builder.() -> Unit

@Composable
private fun Detail(build: AnnotatedBuilder) {
  Text(buildAnnotatedString(build), fontSize = 12.sp, color = ShiodokiColors.TextMuted)
}

/** "HH:mm" in the device time zone, with "MM-dd " in front when it is not today. */
private fun AnnotatedString.Builder.time(instant: Instant) {
  val zone = ZoneId.systemDefault()
  val local = instant.atZone(zone)
  val text = if (local.toLocalDate() == LocalDate.now(zone)) {
    TIME_FORMAT.format(local)
  } else {
    DATE_TIME_FORMAT.format(local)
  }
  withStyle(SpanStyle(fontFamily = MonoFamily)) { append(text) }
}

/** Remaining minutes inside a ring that empties as the session runs. */
@Composable
private fun ProgressRing(remainingMinutes: Long?, totalMinutes: Long?) {
  val fraction = if (remainingMinutes != null && totalMinutes != null && totalMinutes > 0) {
    (remainingMinutes.toFloat() / totalMinutes).coerceIn(0f, 1f)
  } else {
    0f
  }
  Box(Modifier.size(RING_SIZE), contentAlignment = Alignment.Center) {
    Canvas(Modifier.fillMaxSize()) {
      val stroke = RING_STROKE.toPx()
      val diameter = size.minDimension - stroke
      val topLeft = Offset(stroke / 2, stroke / 2)
      drawCircle(ShiodokiColors.Outline, radius = diameter / 2, style = Stroke(stroke))
      drawArc(
        color = ShiodokiColors.Accent,
        startAngle = -90f,
        sweepAngle = 360f * fraction,
        useCenter = false,
        topLeft = topLeft,
        size = Size(diameter, diameter),
        style = Stroke(stroke, cap = StrokeCap.Round),
      )
    }
    if (remainingMinutes != null) {
      Text(
        "$remainingMinutes",
        fontFamily = MonoFamily,
        fontWeight = FontWeight.SemiBold,
        fontSize = 16.sp,
        color = ShiodokiColors.TextStrong,
      )
    }
  }
}

private fun Modifier.dashedBorder(): Modifier = drawBehind {
  val stroke = 1.dp.toPx()
  val radius = CARD_RADIUS.toPx()
  drawRoundRect(
    color = ShiodokiColors.OutlineInactive,
    topLeft = Offset(stroke / 2, stroke / 2),
    size = Size(size.width - stroke, size.height - stroke),
    cornerRadius = CornerRadius(radius, radius),
    style = Stroke(stroke, pathEffect = PathEffect.dashPathEffect(floatArrayOf(12f, 8f))),
  )
}

private val CARD_RADIUS = 16.dp
private val CARD_SHAPE = RoundedCornerShape(CARD_RADIUS)
private val RING_SIZE = 56.dp
private val RING_STROKE = 4.5.dp
private val TIME_FORMAT = DateTimeFormatter.ofPattern("HH:mm")
private val DATE_TIME_FORMAT = DateTimeFormatter.ofPattern("MM-dd HH:mm")

/** Stroke icons from the design canvas (24×24 viewBox, 2px stroke, round caps). */
private object Icons {
  val List = strokeIcon("List", "M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01")
  val Snooze = strokeIcon("Snooze", "M20.5 12a8.5 8.5 0 1 1-2.6-6.1", "M20.5 3.5v4.5H16", "M12 8v4.5l3 1.8")
  val Stop = strokeIcon("Stop", "M8 6h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z")
  val Offline = strokeIcon(
    "Offline",
    "M3 3l18 18",
    "M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 5-2.7M14 10.3a10 10 0 0 1 5 2.7M2 9.5a15 15 0 0 1 4.5-3M12 5a15 15 0 0 1 10 4.5",
    "M12 20h.01",
  )
  val Power = strokeIcon("Power", "M12 3v8", "M6.3 6.8a8 8 0 1 0 11.4 0")

  private fun strokeIcon(name: String, vararg paths: String): ImageVector =
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
}
