package dev.kaorukajihara.shiodoki.ui.home

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.kaorukajihara.shiodoki.R
import dev.kaorukajihara.shiodoki.ui.components.strokeIcon
import dev.kaorukajihara.shiodoki.ui.holdRemainingText
import dev.kaorukajihara.shiodoki.ui.theme.ShiodokiColors

private val HoldIcon = strokeIcon("Hold", "M12 2.5a9.5 9.5 0 1 0 0 19a9.5 9.5 0 1 0 0-19z", "M9.5 9.5h5v5h-5z")

/**
 * "一時停止中 · あと 47 時間 30 分", the reason, and "一時停止を終了" (M-20, design §6.9). The only
 * place the reason is shown. Every text fits one line (design canvas).
 */
@Composable
fun HoldCardView(card: HoldCard, onEnd: () -> Unit, modifier: Modifier = Modifier) {
  val shape = RoundedCornerShape(20.dp)
  Column(
    modifier = modifier
      .fillMaxWidth()
      .background(ShiodokiColors.SurfaceRaised, shape)
      .border(1.dp, ShiodokiColors.Accent, shape)
      .padding(start = 18.dp, end = 16.dp, top = 16.dp, bottom = 12.dp),
    verticalArrangement = Arrangement.spacedBy(10.dp),
  ) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
      Icon(HoldIcon, contentDescription = null, tint = ShiodokiColors.Accent, modifier = Modifier.size(22.dp))
      Text(
        stringResource(R.string.hold_card_title),
        fontSize = 13.sp,
        fontWeight = FontWeight.Bold,
        color = ShiodokiColors.AccentLight,
        maxLines = 1,
        modifier = Modifier.weight(1f),
      )
      Text(
        holdRemainingText(LocalContext.current.resources, card.remaining),
        fontSize = 15.sp,
        fontWeight = FontWeight.Medium,
        color = ShiodokiColors.TextStrong,
        maxLines = 1,
      )
    }
    Column(Modifier.padding(start = 32.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
      Text(stringResource(R.string.hold_reason), fontSize = 12.sp, color = ShiodokiColors.TextMuted)
      Text(
        card.reason,
        fontSize = 15.sp,
        color = ShiodokiColors.TextStrong,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
      )
    }
    OutlinedButton(
      onClick = onEnd,
      border = BorderStroke(1.dp, ShiodokiColors.OutlineInactive),
      modifier = Modifier.align(Alignment.End).height(44.dp),
    ) {
      Icon(
        Icons.Filled.PlayArrow,
        contentDescription = null,
        tint = ShiodokiColors.AccentLight,
        modifier = Modifier.padding(end = 6.dp).size(16.dp),
      )
      Text(stringResource(R.string.hold_end), fontWeight = FontWeight.Bold, color = ShiodokiColors.AccentLight)
    }
  }
}
