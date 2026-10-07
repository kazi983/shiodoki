package dev.kaorukajihara.shiodoki.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import dev.kaorukajihara.shiodoki.model.Priority

/** Text color on the pastel priority colors; fixed so it stays readable in dark theme too. */
val PriorityTextColor = Color(0xFF1F2937)

/** "🔥 今すぐ" on the priority color, as in the desktop lists. */
@Composable
fun PriorityLabel(priority: Priority, modifier: Modifier = Modifier) {
  Text(
    text = "${priority.icon} ${priority.label}",
    color = PriorityTextColor,
    style = MaterialTheme.typography.labelMedium,
    modifier = modifier
      .background(Color(priority.color), RoundedCornerShape(6.dp))
      .padding(horizontal = 6.dp, vertical = 2.dp),
  )
}
