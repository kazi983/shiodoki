package dev.kaorukajihara.shiodoki.ui.home

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dev.kaorukajihara.shiodoki.R
import dev.kaorukajihara.shiodoki.data.TaskMove
import dev.kaorukajihara.shiodoki.model.Priority
import dev.kaorukajihara.shiodoki.model.Task
import dev.kaorukajihara.shiodoki.model.TaskDrop
import dev.kaorukajihara.shiodoki.model.formatMinutes
import dev.kaorukajihara.shiodoki.ui.components.DraggableTaskRow
import dev.kaorukajihara.shiodoki.ui.components.MainBottomBar
import dev.kaorukajihara.shiodoki.ui.components.MainTab
import dev.kaorukajihara.shiodoki.ui.components.ScreenHeader
import dev.kaorukajihara.shiodoki.ui.components.SwipeToComplete
import dev.kaorukajihara.shiodoki.ui.components.SyncIndicator
import dev.kaorukajihara.shiodoki.ui.components.TaskListEntry
import dev.kaorukajihara.shiodoki.ui.components.entriesOf
import dev.kaorukajihara.shiodoki.ui.components.rememberTaskDragState
import dev.kaorukajihara.shiodoki.ui.components.showWithUndo
import dev.kaorukajihara.shiodoki.ui.components.taskDrag
import dev.kaorukajihara.shiodoki.ui.priorityHeading
import dev.kaorukajihara.shiodoki.ui.shortName
import dev.kaorukajihara.shiodoki.ui.theme.MonoFamily
import dev.kaorukajihara.shiodoki.ui.theme.ShiodokiColors
import dev.kaorukajihara.shiodoki.ui.theme.color
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

/** Design §5.3 and the "ホーム" artboard: the PC status card and incomplete tasks by priority. */
@Composable
fun HomeScreen(
  viewModel: HomeViewModel,
  onAddTask: () -> Unit,
  onEditTask: (taskId: String) -> Unit,
  onSelectTab: (MainTab) -> Unit,
) {
  val state by viewModel.uiState.collectAsStateWithLifecycle()
  val pcStatus by viewModel.pcStatus.collectAsStateWithLifecycle()
  val snackbarHostState = remember { SnackbarHostState() }
  val saveFailed = stringResource(R.string.save_failed)
  val completed = stringResource(R.string.task_completed)
  val undo = stringResource(R.string.undo)
  val scope = rememberCoroutineScope()
  val onMove = rememberMoveWithUndo(snackbarHostState, scope, viewModel::move, viewModel::undoMove)

  LaunchedEffect(Unit) {
    viewModel.writeFailures.collect { snackbarHostState.showSnackbar(saveFailed) }
  }

  Scaffold(
    topBar = { ScreenHeader(stringResource(R.string.tab_tasks)) { SyncIndicator(state.syncStatus) } },
    bottomBar = { MainBottomBar(MainTab.TASKS, onSelectTab) },
    floatingActionButton = {
      FloatingActionButton(
        onClick = onAddTask,
        shape = RoundedCornerShape(16.dp),
        containerColor = ShiodokiColors.Accent,
        contentColor = ShiodokiColors.OnAccent,
        modifier = Modifier.padding(end = 8.dp),
      ) {
        Icon(Icons.Filled.Add, contentDescription = stringResource(R.string.add_task))
      }
    },
    snackbarHost = { SnackbarHost(snackbarHostState) },
  ) { padding ->
    Column(Modifier.fillMaxSize().padding(padding)) {
      // Not shown until state/desktop is loaded, so "no data" does not flash on start.
      pcStatus?.let { PcStatusCard(it, Modifier.padding(horizontal = 24.dp)) }
      TaskList(
        groups = state.groups,
        topPadding = if (pcStatus == null) 8.dp else 28.dp,
        onEditTask = onEditTask,
        onComplete = { taskId ->
          viewModel.complete(taskId)
          scope.launch {
            if (snackbarHostState.showWithUndo(completed, undo)) viewModel.undoComplete(taskId)
          }
        },
        onMove = onMove,
      )
    }
  }
}

/**
 * Writes a drop with [move] and, when it changed the priority, shows "NOW → SOON に移動しました" with undo (design
 * §5.3). The returned function tells the list whether the drop wrote anything.
 */
@Composable
internal fun rememberMoveWithUndo(
  snackbarHostState: SnackbarHostState,
  scope: CoroutineScope,
  move: (TaskDrop) -> TaskMove?,
  undoMove: (TaskMove) -> Unit,
): (TaskDrop) -> Boolean {
  val moved = stringResource(R.string.task_moved)
  val undo = stringResource(R.string.undo)
  return { drop ->
    val result = move(drop)
    if (result != null && result.priorityChanged) {
      val message = String.format(moved, result.from.shortName, result.to.shortName)
      scope.launch { if (snackbarHostState.showWithUndo(message, undo)) undoMove(result) }
    }
    result != null
  }
}

/**
 * Open tasks under priority headings, each swipeable to complete and draggable after a long press (design §5.3).
 * Also the "未完了" view of the All tab.
 */
@Composable
internal fun ColumnScope.TaskList(
  groups: List<PriorityGroup>?,
  topPadding: Dp,
  onEditTask: (taskId: String) -> Unit,
  onComplete: (taskId: String) -> Unit,
  onMove: (TaskDrop) -> Boolean,
) {
  val fill = Modifier.weight(1f).fillMaxWidth()
  when {
    groups == null -> Box(fill, Alignment.Center) {
      CircularProgressIndicator(color = ShiodokiColors.Accent)
    }
    groups.isEmpty() -> Box(fill, Alignment.Center) {
      Text(stringResource(R.string.no_open_tasks), color = ShiodokiColors.TextMuted)
    }
    else -> GroupedTaskList(
      groups = groups,
      onMove = onMove,
      modifier = fill.bottomFade(),
      // The bottom padding keeps the last row clear of the add button.
      contentPadding = PaddingValues(start = 24.dp, end = 24.dp, top = topPadding, bottom = 88.dp),
    ) { task ->
      // The swipe state is not saveable, so a task restored by undo starts settled again.
      SwipeToComplete(onComplete = { onComplete(task.id) }, modifier = Modifier) {
        TaskRow(task = task, detail = formatMinutes(task.totalMinutes), onClick = { onEditTask(task.id) })
      }
    }
  }
}

/**
 * Tasks under priority headings; a long press on a row drags it (design §5.3). While a row is dragged every heading
 * is shown, so a task can be dropped into a priority without tasks. [rowShape] is the shape of the rows, for the
 * shadow of the dragged one.
 */
@Composable
internal fun GroupedTaskList(
  groups: List<PriorityGroup>,
  onMove: (TaskDrop) -> Boolean,
  modifier: Modifier,
  contentPadding: PaddingValues,
  spacing: Dp = 8.dp,
  headingGap: Dp = 16.dp,
  rowShape: Shape = RoundedCornerShape(12.dp),
  row: @Composable (task: Task) -> Unit,
) {
  val listState = rememberLazyListState()
  val drag = rememberTaskDragState(listState, groups, onMove)
  LazyColumn(
    state = listState,
    modifier = modifier.taskDrag(drag),
    contentPadding = contentPadding,
    verticalArrangement = Arrangement.spacedBy(spacing),
  ) {
    itemsIndexed(
      drag.entries ?: entriesOf(groups, allHeadings = false),
      key = { _, entry -> entry.key },
      contentType = { _, entry -> entry::class },
    ) { index, entry ->
      when (entry) {
        is TaskListEntry.Heading -> GroupHeader(
          entry.priority,
          Modifier.animateItem().padding(top = if (index == 0) 0.dp else headingGap),
        )
        is TaskListEntry.Row -> DraggableTaskRow(drag, entry.key, rowShape) { row(entry.task) }
      }
    }
  }
}

/** "■ NOW  今すぐ" */
@Composable
internal fun GroupHeader(priority: Priority, modifier: Modifier = Modifier) {
  Row(
    modifier = modifier.padding(horizontal = 4.dp),
    verticalAlignment = Alignment.CenterVertically,
    horizontalArrangement = Arrangement.spacedBy(8.dp),
  ) {
    Box(Modifier.size(8.dp).background(priority.color, RoundedCornerShape(2.dp)))
    Text(
      priorityHeading(priority),
      fontSize = 11.sp,
      fontWeight = FontWeight.Bold,
      letterSpacing = 0.08.em,
      color = ShiodokiColors.TextMuted,
    )
  }
}

/** Name, the first memo line and [detail] on the right (the total time, or the completion date). */
@Composable
internal fun TaskRow(task: Task, detail: String, onClick: () -> Unit) {
  val memoLine = task.memo.lineSequence().firstOrNull { it.isNotBlank() }
  Row(
    modifier = Modifier
      .fillMaxWidth()
      .heightIn(min = 56.dp)
      .clip(RoundedCornerShape(12.dp))
      .background(ShiodokiColors.Surface)
      .clickable(onClick = onClick)
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
      detail,
      fontFamily = MonoFamily,
      fontWeight = FontWeight.Medium,
      fontSize = 12.sp,
      color = ShiodokiColors.TextMuted,
    )
  }
}

/** Fades out the last 32dp, so rows scrolling under the add button do not end abruptly. */
internal fun Modifier.bottomFade(): Modifier = this
  .graphicsLayer(compositingStrategy = CompositingStrategy.Offscreen)
  .drawWithContent {
    drawContent()
    val fadeStart = (size.height - 32.dp.toPx()) / size.height
    drawRect(
      brush = Brush.verticalGradient(fadeStart to Color.Black, 1f to Color.Transparent),
      blendMode = BlendMode.DstIn,
    )
  }
