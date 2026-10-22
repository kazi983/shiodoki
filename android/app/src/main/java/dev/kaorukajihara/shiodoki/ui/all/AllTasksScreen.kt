package dev.kaorukajihara.shiodoki.ui.all

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dev.kaorukajihara.shiodoki.R
import dev.kaorukajihara.shiodoki.model.TaskDrop
import dev.kaorukajihara.shiodoki.ui.components.MainBottomBar
import dev.kaorukajihara.shiodoki.ui.components.MainTab
import dev.kaorukajihara.shiodoki.ui.components.ScreenHeader
import dev.kaorukajihara.shiodoki.ui.components.SwipeToReopen
import dev.kaorukajihara.shiodoki.ui.components.SyncIndicator
import dev.kaorukajihara.shiodoki.ui.components.showWithUndo
import dev.kaorukajihara.shiodoki.ui.home.GroupedTaskList
import dev.kaorukajihara.shiodoki.ui.home.PriorityGroup
import dev.kaorukajihara.shiodoki.ui.home.TaskList
import dev.kaorukajihara.shiodoki.ui.home.TaskRow
import dev.kaorukajihara.shiodoki.ui.home.bottomFade
import dev.kaorukajihara.shiodoki.ui.home.rememberMoveWithUndo
import dev.kaorukajihara.shiodoki.ui.rememberDateFormatter
import dev.kaorukajihara.shiodoki.ui.theme.ShiodokiColors
import java.time.ZoneId
import kotlinx.coroutines.launch

/** Design §5.5: the All tab, with "未完了" (open) and "完了済み" (completed in the last 30 days). */
@Composable
fun AllTasksScreen(
  viewModel: AllTasksViewModel,
  onEditTask: (taskId: String) -> Unit,
  onSelectTab: (MainTab) -> Unit,
) {
  val state by viewModel.uiState.collectAsStateWithLifecycle()
  val snackbarHostState = remember { SnackbarHostState() }
  val saveFailed = stringResource(R.string.save_failed)
  val completed = stringResource(R.string.task_completed)
  val reopened = stringResource(R.string.task_reopened)
  val undo = stringResource(R.string.undo)
  val scope = rememberCoroutineScope()
  val onMove = rememberMoveWithUndo(snackbarHostState, scope, viewModel::move, viewModel::undoMove)
  val onMoveCompleted = rememberMoveWithUndo(snackbarHostState, scope, viewModel::moveCompleted, viewModel::undoMove)

  LaunchedEffect(Unit) {
    viewModel.writeFailures.collect { snackbarHostState.showSnackbar(saveFailed) }
  }

  Scaffold(
    topBar = { ScreenHeader(stringResource(R.string.tab_all)) { SyncIndicator(state.syncStatus) } },
    bottomBar = { MainBottomBar(MainTab.ALL, onSelectTab) },
    snackbarHost = { SnackbarHost(snackbarHostState) },
  ) { padding ->
    Column(Modifier.fillMaxSize().padding(padding)) {
      FilterRow(state.filter, viewModel::selectFilter)
      when (state.filter) {
        TaskFilter.OPEN -> TaskList(
          groups = state.open,
          topPadding = 16.dp,
          onEditTask = onEditTask,
          onComplete = { taskId ->
            viewModel.complete(taskId)
            scope.launch { if (snackbarHostState.showWithUndo(completed, undo)) viewModel.reopen(taskId) }
          },
          onMove = onMove,
        )
        TaskFilter.COMPLETED -> CompletedList(
          groups = state.completed,
          onEditTask = onEditTask,
          onReopen = { taskId ->
            viewModel.reopen(taskId)
            scope.launch { if (snackbarHostState.showWithUndo(reopened, undo)) viewModel.complete(taskId) }
          },
          onMove = onMoveCompleted,
        )
      }
    }
  }
}

@Composable
private fun FilterRow(selected: TaskFilter, onSelect: (TaskFilter) -> Unit) {
  Row(Modifier.padding(horizontal = 24.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
    TaskFilter.entries.forEach { filter ->
      FilterChip(
        selected = filter == selected,
        onClick = { onSelect(filter) },
        label = {
          Text(
            stringResource(
              when (filter) {
                TaskFilter.OPEN -> R.string.filter_open
                TaskFilter.COMPLETED -> R.string.filter_completed
              },
            ),
          )
        },
        colors = FilterChipDefaults.filterChipColors(
          labelColor = ShiodokiColors.TextMuted,
          selectedContainerColor = ShiodokiColors.NavIndicator,
          selectedLabelColor = ShiodokiColors.TextStrong,
        ),
      )
    }
  }
}

/**
 * By priority, each newest first with its completion date; a swipe reopens the task. Dragging a row into another
 * priority changes only its priority (design §5.5).
 */
@Composable
private fun ColumnScope.CompletedList(
  groups: List<PriorityGroup>?,
  onEditTask: (taskId: String) -> Unit,
  onReopen: (taskId: String) -> Unit,
  onMove: (TaskDrop) -> Boolean,
) {
  val fill = Modifier.weight(1f).fillMaxWidth()
  val dateFormatter = rememberDateFormatter()
  when {
    groups == null -> Box(fill, Alignment.Center) {
      CircularProgressIndicator(color = ShiodokiColors.Accent)
    }
    groups.isEmpty() -> Box(fill, Alignment.Center) {
      Text(stringResource(R.string.no_completed_tasks), color = ShiodokiColors.TextMuted)
    }
    else -> GroupedTaskList(
      groups = groups,
      onMove = onMove,
      modifier = fill.bottomFade(),
      contentPadding = PaddingValues(start = 24.dp, end = 24.dp, top = 16.dp, bottom = 32.dp),
    ) { task ->
      // recentlyCompleted only returns tasks with completedAt.
      val date = task.completedAt?.atZone(ZoneId.systemDefault())?.format(dateFormatter).orEmpty()
      SwipeToReopen(onReopen = { onReopen(task.id) }, modifier = Modifier) {
        TaskRow(task = task, detail = date, onClick = { onEditTask(task.id) })
      }
    }
  }
}
