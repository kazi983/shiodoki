package dev.kaorukajihara.shiodoki.ui.login

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dev.kaorukajihara.shiodoki.ui.theme.ShiodokiColors

/** M-01 (design §5.2) and the "ログイン" artboard. */
@Composable
fun LoginScreen(viewModel: LoginViewModel) {
  val state by viewModel.state.collectAsStateWithLifecycle()
  // The Activity context: Credential Manager shows its picker on top of it.
  val context = LocalContext.current

  Scaffold { padding ->
    Column(
      modifier = Modifier
        .fillMaxSize()
        .padding(padding)
        .padding(start = 32.dp, end = 32.dp, bottom = 48.dp),
    ) {
      Column(
        modifier = Modifier.weight(1f).fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(40.dp, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally,
      ) {
        Logo()
        Column(
          verticalArrangement = Arrangement.spacedBy(10.dp),
          horizontalAlignment = Alignment.CenterHorizontally,
        ) {
          Text(
            "Shiodoki",
            fontSize = 26.sp,
            fontWeight = FontWeight.Bold,
            color = ShiodokiColors.TextStrong,
          )
          Text(
            "PC と同じタスクを、スマホからも\n確認・追加・編集できます。",
            fontSize = 15.sp,
            lineHeight = 24.sp,
            color = ShiodokiColors.TextMuted,
            textAlign = TextAlign.Center,
          )
        }
      }
      Column(
        verticalArrangement = Arrangement.spacedBy(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
      ) {
        state.error?.let {
          Text(it, fontSize = 13.sp, color = ShiodokiColors.Danger, textAlign = TextAlign.Center)
        }
        Button(
          onClick = { viewModel.signIn(context) },
          enabled = !state.busy,
          shape = RoundedCornerShape(16.dp),
          colors = ButtonDefaults.buttonColors(
            containerColor = ShiodokiColors.Accent,
            contentColor = ShiodokiColors.OnAccent,
            disabledContainerColor = ShiodokiColors.Accent.copy(alpha = 0.5f),
            disabledContentColor = ShiodokiColors.OnAccent,
          ),
          modifier = Modifier.fillMaxWidth().height(56.dp),
        ) {
          if (state.busy) {
            CircularProgressIndicator(
              color = ShiodokiColors.OnAccent,
              strokeWidth = 2.dp,
              modifier = Modifier.size(22.dp),
            )
          } else {
            Text("Google でログイン", fontSize = 16.sp, fontWeight = FontWeight.Bold)
          }
        }
      }
    }
  }
}

/** A half-filled timer ring with a play mark, drawn in the artboard's 44×44 coordinates. */
@Composable
private fun Logo() {
  Canvas(Modifier.size(112.dp)) {
    scale(size.minDimension / 44f, pivot = Offset.Zero) {
      val stroke = Stroke(width = 3f, cap = StrokeCap.Round)
      val ring = Size(36f, 36f)
      val topLeft = Offset(4f, 4f)
      drawArc(ShiodokiColors.Outline, 0f, 360f, false, topLeft, ring, style = stroke)
      drawArc(ShiodokiColors.Accent, -90f, 180f, false, topLeft, ring, style = stroke)
      val play = Path().apply {
        moveTo(18.5f, 15.5f)
        lineTo(18.5f, 28.5f)
        lineTo(28.5f, 22f)
        close()
      }
      drawPath(play, ShiodokiColors.TextStrong)
    }
  }
}
