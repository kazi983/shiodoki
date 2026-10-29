package dev.kaorukajihara.shiodoki.ui.focus

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsIgnoringVisibility
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dev.kaorukajihara.shiodoki.R
import dev.kaorukajihara.shiodoki.model.Task
import dev.kaorukajihara.shiodoki.model.TaskDrop
import dev.kaorukajihara.shiodoki.model.formatMinutes
import dev.kaorukajihara.shiodoki.ui.components.SwipeToComplete
import dev.kaorukajihara.shiodoki.ui.components.showWithUndo
import dev.kaorukajihara.shiodoki.ui.components.strokeIcon
import dev.kaorukajihara.shiodoki.ui.home.GroupedTaskList
import dev.kaorukajihara.shiodoki.ui.home.PriorityGroup
import dev.kaorukajihara.shiodoki.ui.home.rememberMoveWithUndo
import dev.kaorukajihara.shiodoki.ui.message
import dev.kaorukajihara.shiodoki.ui.theme.MonoFamily
import dev.kaorukajihara.shiodoki.ui.theme.ShiodokiColors
import kotlinx.coroutines.launch

/** Design §5.7 and the "フォーカス画面" artboard. */
@Composable
fun FocusContent(viewModel: FocusViewModel) {
  val state by viewModel.uiState.collectAsStateWithLifecycle()
  val snackbarHostState = remember { SnackbarHostState() }
  val scope = rememberCoroutineScope()
  val completed = stringResource(R.string.task_completed)
  val undo = stringResource(R.string.undo)
  val onMove = rememberMoveWithUndo(snackbarHostState, scope, viewModel::move, viewModel::undoMove)
  // Back does nothing: there is no skip (M-14). Leaving with Home brings the screen back a
  // minute later (FocusActivity.onStop). While the start confirmation is open, Back goes to the
  // dialog and chooses again.
  BackHandler {}

  Column(
    modifier = Modifier
      .fillMaxSize()
      .background(ShiodokiColors.Background)
      // The status bar stays visible so the time and notifications can be checked.
      .statusBarsPadding()
      .navigationBarsPadding()
      .imePadding(),
  ) {
    ModeBanner()

    Column(
      modifier = Modifier
        .weight(1f)
        .padding(start = 24.dp, end = 24.dp, top = 24.dp),
      verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
      Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(stringResource(R.string.what_now), fontSize = 28.sp, fontWeight = FontWeight.Bold, color = ShiodokiColors.TextStrong)
        Text(stringResource(R.string.focus_subtitle), fontSize = 13.sp, color = ShiodokiColors.TextMuted)
      }

      QuickAdd(viewModel)

      Box(Modifier.weight(1f)) {
        TaskList(
          groups = state.groups,
          highlightedId = viewModel.addedTaskId,
          onSelect = { viewModel.select(it.id, it.name) },
          onComplete = { taskId ->
            viewModel.complete(taskId)
            scope.launch {
              if (snackbarHostState.showWithUndo(completed, undo)) viewModel.undoComplete(taskId)
            }
          },
          onMove = onMove,
          modifier = Modifier.fillMaxSize(),
        )
        SnackbarHost(snackbarHostState, Modifier.align(Alignment.BottomCenter))
      }
    }

    ShortcutDock(state.pcTask, state.previous, onSelect = viewModel::select)
  }

  viewModel.pendingStart?.let {
    StartConfirmDialog(it, onConfirm = viewModel::confirmStart, onDismiss = viewModel::cancelStart)
  }
}

/** The accent strip that tells this screen (tap = start) apart from the task list (tap = edit). */
@Composable
private fun ModeBanner() {
  Row(
    modifier = Modifier
      .fillMaxWidth()
      .background(ShiodokiColors.Accent)
      .padding(horizontal = 24.dp, vertical = 12.dp),
    verticalAlignment = Alignment.CenterVertically,
    horizontalArrangement = Arrangement.spacedBy(10.dp),
  ) {
    Icon(Icons.Filled.PlayArrow, contentDescription = null, tint = ShiodokiColors.OnAccent, modifier = Modifier.size(18.dp))
    Text(
      stringResource(R.string.focus_banner),
      fontSize = 13.sp,
      fontWeight = FontWeight.Bold,
      color = ShiodokiColors.OnAccent,
    )
  }
}

/**
 * "PC と同じ" above "スマホで前回", fixed at the bottom within thumb reach. When both are shown,
 * only the top one is filled so the two do not compete; hidden when there is neither.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ShortcutDock(pcTask: PcTask?, previous: Task?, onSelect: (taskId: String, taskName: String) -> Unit) {
  if (pcTask == null && previous == null) return
  Column(Modifier.fillMaxWidth().background(ShiodokiColors.NavBar)) {
    HorizontalDivider(color = ShiodokiColors.Outline)
    Column(
      modifier = Modifier
        // The navigation bar is hidden (FocusActivity), so navigationBarsPadding() is 0 and a
        // swipe shows the bar over the cards. Keep its height free anyway; what the screen
        // already consumed (a visible bar, the keyboard) is not padded twice.
        .windowInsetsPadding(WindowInsets.navigationBarsIgnoringVisibility)
        .padding(start = 24.dp, end = 24.dp, top = 16.dp, bottom = 20.dp),
      verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
      pcTask?.let { pc ->
        val elapsed = pc.elapsedMinutes?.let { " · " + stringResource(R.string.elapsed_minutes, it) }.orEmpty()
        ShortcutButton(
          icon = FocusIcons.Monitor,
          caption = stringResource(R.string.pc_running) + elapsed,
          name = pc.taskName,
          action = stringResource(R.string.focus_same_as_pc),
          primary = true,
          onClick = { onSelect(pc.taskId, pc.taskName) },
        )
      }
      previous?.let { task ->
        ShortcutButton(
          icon = FocusIcons.History,
          caption = stringResource(R.string.focus_last_on_phone),
          name = task.name,
          action = stringResource(R.string.focus_resume),
          primary = pcTask == null,
          onClick = { onSelect(task.id, task.name) },
        )
      }
    }
  }
}

/**
 * "「X」をはじめます" before starting (M-13, design §5.7). Back and a tap outside choose again,
 * like the dismiss button.
 */
@Composable
private fun StartConfirmDialog(pending: PendingStart, onConfirm: () -> Unit, onDismiss: () -> Unit) {
  AlertDialog(
    onDismissRequest = onDismiss,
    title = { Text(stringResource(R.string.focus_start_confirm, pending.taskName)) },
    confirmButton = {
      TextButton(onClick = onConfirm) { Text(stringResource(R.string.focus_start_ok)) }
    },
    dismissButton = {
      TextButton(onClick = onDismiss) { Text(stringResource(R.string.focus_choose_again)) }
    },
  )
}

/** A tap asks to start that task. [primary] is filled with the accent, otherwise outlined. */
@Composable
private fun ShortcutButton(
  icon: ImageVector,
  caption: String,
  name: String,
  action: String,
  primary: Boolean,
  onClick: () -> Unit,
) {
  val shape = RoundedCornerShape(20.dp)
  // On a short (landscape) screen two tall cards would leave the task list almost no room.
  val minHeight = if (LocalConfiguration.current.screenHeightDp < COMPACT_HEIGHT_DP) 76.dp else 114.dp
  Row(
    modifier = Modifier
      .fillMaxWidth()
      .heightIn(min = minHeight)
      .clip(shape)
      .background(if (primary) ShiodokiColors.Accent else ShiodokiColors.SurfaceRaised)
      .then(if (primary) Modifier else Modifier.border(1.5.dp, ShiodokiColors.Accent, shape))
      .clickable(role = Role.Button, onClick = onClick)
      .padding(start = 20.dp, end = 12.dp, top = 12.dp, bottom = 12.dp),
    verticalAlignment = Alignment.CenterVertically,
    horizontalArrangement = Arrangement.spacedBy(14.dp),
  ) {
    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
      Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        val captionColor = if (primary) ShiodokiColors.OnAccent else ShiodokiColors.TextMuted
        Icon(icon, contentDescription = null, tint = captionColor, modifier = Modifier.size(14.dp))
        Text(caption, fontSize = 12.sp, fontWeight = FontWeight.Bold, color = captionColor)
      }
      Text(
        name,
        fontSize = 17.sp,
        fontWeight = FontWeight.Bold,
        color = if (primary) ShiodokiColors.OnAccent else ShiodokiColors.TextStrong,
        // The taller card has room for a second line, so long names wrap before they are cut.
        maxLines = 2,
        overflow = TextOverflow.Ellipsis,
      )
    }
    Row(
      modifier = Modifier
        .height(48.dp)
        .background(if (primary) ShiodokiColors.OnAccent else ShiodokiColors.Accent, CircleShape)
        .padding(horizontal = 16.dp),
      verticalAlignment = Alignment.CenterVertically,
      horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
      val actionColor = if (primary) ShiodokiColors.AccentLight else ShiodokiColors.OnAccent
      Icon(Icons.Filled.PlayArrow, contentDescription = null, tint = actionColor, modifier = Modifier.size(18.dp))
      Text(action, fontSize = 14.sp, fontWeight = FontWeight.Bold, color = actionColor)
    }
  }
}

/** Material's compact window height class (< 480dp), typically a phone in landscape. */
private const val COMPACT_HEIGHT_DP = 480

/** Adds a task with priority NOW without starting it (design §5.7, Q-A3). */
@Composable
private fun QuickAdd(viewModel: FocusViewModel) {
  Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.Top) {
    OutlinedTextField(
      value = viewModel.newTaskName,
      onValueChange = viewModel::onNewTaskNameChange,
      placeholder = { Text(stringResource(R.string.focus_new_task_placeholder), color = ShiodokiColors.TextMuted) },
      singleLine = true,
      isError = viewModel.error != null,
      supportingText = viewModel.error?.let { { Text(it.message()) } },
      keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
      keyboardActions = KeyboardActions(onDone = { viewModel.quickAdd() }),
      textStyle = TextStyle(fontSize = 15.sp),
      shape = RoundedCornerShape(12.dp),
      colors = OutlinedTextFieldDefaults.colors(
        focusedContainerColor = ShiodokiColors.Surface,
        unfocusedContainerColor = ShiodokiColors.Surface,
        errorContainerColor = ShiodokiColors.Surface,
        focusedTextColor = ShiodokiColors.TextStrong,
        unfocusedTextColor = ShiodokiColors.TextStrong,
        unfocusedBorderColor = ShiodokiColors.Outline,
        focusedBorderColor = ShiodokiColors.Accent,
        cursorColor = ShiodokiColors.Accent,
      ),
      modifier = Modifier.weight(1f),
    )
    FilledIconButton(
      onClick = viewModel::quickAdd,
      shape = RoundedCornerShape(12.dp),
      colors = IconButtonDefaults.filledIconButtonColors(
        containerColor = ShiodokiColors.Outline,
        contentColor = ShiodokiColors.Text,
      ),
      modifier = Modifier.padding(top = 4.dp).size(52.dp),
    ) {
      Icon(Icons.Filled.Add, contentDescription = stringResource(R.string.add_task))
    }
  }
}

/** Swipe completes, a long press drags the row to another place or priority (design §5.7). */
@Composable
private fun TaskList(
  groups: List<PriorityGroup>?,
  highlightedId: String?,
  onSelect: (Task) -> Unit,
  onComplete: (taskId: String) -> Unit,
  onMove: (TaskDrop) -> Boolean,
  modifier: Modifier,
) {
  when {
    groups == null -> Box(modifier.fillMaxWidth(), Alignment.Center) {
      CircularProgressIndicator(color = ShiodokiColors.Accent)
    }
    groups.isEmpty() -> Box(modifier.fillMaxWidth(), Alignment.Center) {
      Text(stringResource(R.string.no_open_tasks), color = ShiodokiColors.TextMuted)
    }
    else -> GroupedTaskList(
      groups = groups,
      onMove = onMove,
      modifier = modifier.fillMaxWidth(),
      contentPadding = PaddingValues(top = 4.dp, bottom = 16.dp),
      spacing = 10.dp,
      headingGap = 12.dp,
      rowShape = RoundedCornerShape(16.dp),
    ) { task ->
      SwipeToComplete(onComplete = { onComplete(task.id) }, modifier = Modifier) {
        TaskRow(task, highlighted = task.id == highlightedId, onClick = { onSelect(task) })
      }
    }
  }
}

/** A raised card with a play button, unlike the flat rows of the task list (tap = edit there). */
@Composable
private fun TaskRow(task: Task, highlighted: Boolean, onClick: () -> Unit) {
  val shape = RoundedCornerShape(16.dp)
  Row(
    modifier = Modifier
      .fillMaxWidth()
      .heightIn(min = 64.dp)
      .clip(shape)
      .background(ShiodokiColors.SurfaceRaised)
      .border(if (highlighted) 2.dp else 1.dp, if (highlighted) ShiodokiColors.Accent else ShiodokiColors.Outline, shape)
      .clickable(role = Role.Button, onClick = onClick)
      .padding(start = 16.dp, end = 10.dp, top = 8.dp, bottom = 8.dp),
    verticalAlignment = Alignment.CenterVertically,
    horizontalArrangement = Arrangement.spacedBy(12.dp),
  ) {
    Column(Modifier.weight(1f)) {
      Text(
        task.name,
        fontSize = 16.sp,
        fontWeight = FontWeight.Medium,
        color = ShiodokiColors.TextStrong,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
      )
      Text(
        formatMinutes(task.totalMinutes),
        fontFamily = MonoFamily,
        fontWeight = FontWeight.Medium,
        fontSize = 12.sp,
        color = ShiodokiColors.TextMuted,
      )
    }
    Box(
      Modifier
        .size(44.dp)
        .border(1.5.dp, ShiodokiColors.Accent, CircleShape),
      contentAlignment = Alignment.Center,
    ) {
      Icon(Icons.Filled.PlayArrow, contentDescription = null, tint = ShiodokiColors.Accent, modifier = Modifier.size(18.dp))
    }
  }
}

/** Icons of the "フォーカス画面" artboard. */
private object FocusIcons {
  val Monitor = strokeIcon(
    "Monitor",
    "M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z",
    "M8 21h8",
    "M12 17v4",
  )
  val History = strokeIcon("History", "M3.5 12a8.5 8.5 0 1 0 2.6-6.1", "M3.5 3.5v4.5H8", "M12 8v4.5l3 1.8")
}
