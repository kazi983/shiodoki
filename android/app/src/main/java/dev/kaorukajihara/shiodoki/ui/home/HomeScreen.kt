package dev.kaorukajihara.shiodoki.ui.home

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dev.kaorukajihara.shiodoki.model.Priority
import dev.kaorukajihara.shiodoki.model.Task
import dev.kaorukajihara.shiodoki.model.formatMinutes
import dev.kaorukajihara.shiodoki.ui.components.MainBottomBar
import dev.kaorukajihara.shiodoki.ui.components.MainTab
import dev.kaorukajihara.shiodoki.ui.components.ScreenHeader
import dev.kaorukajihara.shiodoki.ui.components.SyncIndicator
import dev.kaorukajihara.shiodoki.ui.theme.MonoFamily
import dev.kaorukajihara.shiodoki.ui.theme.ShiodokiColors
import dev.kaorukajihara.shiodoki.ui.theme.color

/**
 * Design §5.3 and the "ホーム" artboard: incomplete tasks grouped by priority. The PC status card
 * comes in step 4.
 */
@Composable
fun HomeScreen(
  viewModel: HomeViewModel,
  onAddTask: () -> Unit,
  onEditTask: (taskId: String) -> Unit,
  onSelectTab: (MainTab) -> Unit,
) {
  val state by viewModel.uiState.collectAsStateWithLifecycle()
  val snackbarHostState = remember { SnackbarHostState() }
  // Only the id survives configuration changes; the task itself is looked up again.
  var confirmCompleteId by rememberSaveable { mutableStateOf<String?>(null) }

  LaunchedEffect(Unit) {
    viewModel.writeFailures.collect { snackbarHostState.showSnackbar("保存できませんでした") }
  }

  Scaffold(
    topBar = { ScreenHeader("タスク") { SyncIndicator(state.syncStatus) } },
    bottomBar = { MainBottomBar(MainTab.TASKS, onSelectTab) },
    floatingActionButton = {
      FloatingActionButton(
        onClick = onAddTask,
        shape = RoundedCornerShape(16.dp),
        containerColor = ShiodokiColors.Accent,
        contentColor = ShiodokiColors.OnAccent,
        modifier = Modifier.padding(end = 8.dp),
      ) {
        Icon(Icons.Filled.Add, contentDescription = "タスクを追加")
      }
    },
    snackbarHost = { SnackbarHost(snackbarHostState) },
  ) { padding ->
    val groups = state.groups
    when {
      groups == null -> Box(Modifier.fillMaxSize().padding(padding), Alignment.Center) {
        CircularProgressIndicator(color = ShiodokiColors.Accent)
      }
      groups.isEmpty() -> Box(Modifier.fillMaxSize().padding(padding), Alignment.Center) {
        Text("未完了のタスクはありません", color = ShiodokiColors.TextMuted)
      }
      else -> LazyColumn(
        modifier = Modifier.fillMaxSize().padding(padding).bottomFade(),
        // The bottom padding keeps the last row clear of the add button.
        contentPadding = PaddingValues(start = 24.dp, end = 24.dp, top = 8.dp, bottom = 88.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
      ) {
        groups.forEachIndexed { index, group ->
          item(key = group.priority.name) {
            GroupHeader(group.priority, Modifier.padding(top = if (index == 0) 0.dp else 16.dp))
          }
          items(group.tasks, key = { it.id }) { task ->
            TaskRow(
              task = task,
              onClick = { onEditTask(task.id) },
              onLongClick = { confirmCompleteId = task.id },
            )
          }
        }
      }
    }
  }

  val confirmTask = state.groups?.firstNotNullOfOrNull { g ->
    g.tasks.find { it.id == confirmCompleteId }
  }
  if (confirmTask != null) {
    AlertDialog(
      onDismissRequest = { confirmCompleteId = null },
      title = { Text("完了にしますか？") },
      text = { Text(confirmTask.name) },
      confirmButton = {
        TextButton(onClick = {
          confirmCompleteId = null
          viewModel.complete(confirmTask.id)
        }) { Text("完了") }
      },
      dismissButton = {
        TextButton(onClick = { confirmCompleteId = null }) { Text("キャンセル") }
      },
    )
  }
}

/** "■ NOW  今すぐ" */
@Composable
private fun GroupHeader(priority: Priority, modifier: Modifier = Modifier) {
  Row(
    modifier = modifier.padding(horizontal = 4.dp),
    verticalAlignment = Alignment.CenterVertically,
    horizontalArrangement = Arrangement.spacedBy(8.dp),
  ) {
    Box(Modifier.size(8.dp).background(priority.color, RoundedCornerShape(2.dp)))
    Text(
      "${priority.name}  ${priority.label}",
      fontSize = 11.sp,
      fontWeight = FontWeight.Bold,
      letterSpacing = 0.08.em,
      color = ShiodokiColors.TextMuted,
    )
  }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun TaskRow(task: Task, onClick: () -> Unit, onLongClick: () -> Unit) {
  val memoLine = task.memo.lineSequence().firstOrNull { it.isNotBlank() }
  Row(
    modifier = Modifier
      .fillMaxWidth()
      .heightIn(min = 56.dp)
      .clip(RoundedCornerShape(12.dp))
      .background(ShiodokiColors.Surface)
      .combinedClickable(onClick = onClick, onLongClick = onLongClick)
      .padding(horizontal = 14.dp, vertical = 8.dp),
    verticalAlignment = Alignment.CenterVertically,
    horizontalArrangement = Arrangement.spacedBy(12.dp),
  ) {
    Column(Modifier.weight(1f)) {
      Text(
        task.name,
        fontSize = 15.sp,
        color = ShiodokiColors.TextStrong,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
      )
      if (memoLine != null) {
        Text(
          memoLine,
          fontSize = 12.sp,
          color = ShiodokiColors.TextMuted,
          maxLines = 1,
          overflow = TextOverflow.Ellipsis,
        )
      }
    }
    Text(
      formatMinutes(task.totalMinutes),
      fontFamily = MonoFamily,
      fontWeight = FontWeight.Medium,
      fontSize = 12.sp,
      color = ShiodokiColors.TextMuted,
    )
  }
}

/** Fades out the last 32dp, so rows scrolling under the add button do not end abruptly. */
private fun Modifier.bottomFade(): Modifier = this
  .graphicsLayer(compositingStrategy = CompositingStrategy.Offscreen)
  .drawWithContent {
    drawContent()
    val fadeStart = (size.height - 32.dp.toPx()) / size.height
    drawRect(
      brush = Brush.verticalGradient(fadeStart to Color.Black, 1f to Color.Transparent),
      blendMode = BlendMode.DstIn,
    )
  }
