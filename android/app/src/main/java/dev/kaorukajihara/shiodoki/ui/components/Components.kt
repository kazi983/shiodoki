package dev.kaorukajihara.shiodoki.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.kaorukajihara.shiodoki.data.SyncStatus
import dev.kaorukajihara.shiodoki.ui.theme.ShiodokiColors

/** Large screen title of a tab ("タスク", "設定") with optional content on the right. */
@Composable
fun ScreenHeader(title: String, trailing: @Composable () -> Unit = {}) {
  Row(
    modifier = Modifier
      .fillMaxWidth()
      .statusBarsPadding()
      .padding(start = 24.dp, end = 24.dp, top = 20.dp, bottom = 20.dp),
    verticalAlignment = Alignment.CenterVertically,
    horizontalArrangement = Arrangement.SpaceBetween,
  ) {
    Text(title, fontSize = 24.sp, fontWeight = FontWeight.Bold, color = ShiodokiColors.TextStrong)
    trailing()
  }
}

/** Small caption above a group of rows ("アカウント"). */
@Composable
fun SectionTitle(text: String, modifier: Modifier = Modifier) {
  Text(
    text,
    fontSize = 12.sp,
    fontWeight = FontWeight.Bold,
    color = ShiodokiColors.TextMuted,
    modifier = modifier.padding(horizontal = 4.dp),
  )
}

/** A colored dot followed by the sync status label; null means the first snapshot is pending. */
@Composable
fun SyncIndicator(status: SyncStatus?, dotSize: Int = 8) {
  val color = when (status) {
    SyncStatus.SYNCED -> ShiodokiColors.Synced
    SyncStatus.PENDING -> ShiodokiColors.Pending
    SyncStatus.OFFLINE, null -> ShiodokiColors.TextMuted
  }
  Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
    Dot(color, dotSize)
    Text(status?.label ?: "読み込み中", fontSize = 12.sp, color = ShiodokiColors.TextMuted)
  }
}

@Composable
fun Dot(color: Color, size: Int) {
  Box(Modifier.size(size.dp).background(color, CircleShape))
}

enum class MainTab(val label: String, val icon: ImageVector) {
  TASKS("タスク", Icons.AutoMirrored.Filled.List),
  SETTINGS("設定", Icons.Filled.Settings),
}

/**
 * Bottom navigation of the design. Only the tabs whose screens exist are shown; "完了済み" and
 * "集計" are added with P6.
 */
@Composable
fun MainBottomBar(current: MainTab, onSelect: (MainTab) -> Unit) {
  Column {
    HorizontalDivider(color = ShiodokiColors.Divider)
    NavigationBar(containerColor = ShiodokiColors.NavBar, tonalElevation = 0.dp) {
      MainTab.entries.forEach { tab ->
        val selected = tab == current
        NavigationBarItem(
          selected = selected,
          onClick = { if (!selected) onSelect(tab) },
          icon = { Icon(tab.icon, contentDescription = null, modifier = Modifier.size(20.dp)) },
          label = {
            Text(tab.label, fontSize = 12.sp, fontWeight = if (selected) FontWeight.Bold else null)
          },
          colors = NavigationBarItemDefaults.colors(
            selectedIconColor = ShiodokiColors.Accent,
            selectedTextColor = ShiodokiColors.TextStrong,
            indicatorColor = ShiodokiColors.NavIndicator,
            unselectedIconColor = ShiodokiColors.TextMuted,
            unselectedTextColor = ShiodokiColors.TextMuted,
          ),
        )
      }
    }
  }
}
