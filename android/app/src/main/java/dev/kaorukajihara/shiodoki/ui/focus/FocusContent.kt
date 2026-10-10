package dev.kaorukajihara.shiodoki.ui.focus

import androidx.activity.compose.BackHandler
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.onLongClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dev.kaorukajihara.shiodoki.model.Priority
import dev.kaorukajihara.shiodoki.model.Task
import dev.kaorukajihara.shiodoki.model.formatMinutes
import dev.kaorukajihara.shiodoki.ui.components.SwipeToComplete
import dev.kaorukajihara.shiodoki.ui.components.showCompletedWithUndo
import dev.kaorukajihara.shiodoki.ui.components.strokeIcon
import dev.kaorukajihara.shiodoki.ui.home.PriorityGroup
import dev.kaorukajihara.shiodoki.ui.theme.MonoFamily
import dev.kaorukajihara.shiodoki.ui.theme.ShiodokiColors
import dev.kaorukajihara.shiodoki.ui.theme.color
import kotlinx.coroutines.launch

/** Design §5.7 and the "フォーカス画面" artboard. */
@Composable
fun FocusContent(viewModel: FocusViewModel) {
  val state by viewModel.uiState.collectAsStateWithLifecycle()
  val snackbarHostState = remember { SnackbarHostState() }
  val scope = rememberCoroutineScope()
  // Back does nothing: it would bypass the long press. Leaving with Home is still a skip
  // (FocusActivity.onStop).
  BackHandler {}

  Column(
    modifier = Modifier
      .fillMaxSize()
      .background(ShiodokiColors.Background)
      // The status bar stays visible so the time and notifications can be checked.
      .statusBarsPadding()
      .navigationBarsPadding()
      .imePadding()
      .padding(start = 24.dp, end = 24.dp, top = 32.dp, bottom = 20.dp),
    verticalArrangement = Arrangement.spacedBy(16.dp),
  ) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
      Text("今から何をやる？", fontSize = 26.sp, fontWeight = FontWeight.Bold, color = ShiodokiColors.TextStrong)
      Text("選んだタスクで、画面を消すまで記録します", fontSize = 13.sp, color = ShiodokiColors.TextMuted)
    }

    state.pcTask?.let { pc ->
      val elapsed = pc.elapsedMinutes?.let { " · ${it}分経過" }.orEmpty()
      ShortcutCard(
        icon = FocusIcons.Monitor,
        caption = "PC で実行中$elapsed",
        name = pc.taskName,
        highlighted = true,
        onClick = { viewModel.select(pc.taskId, pc.taskName) },
      ) {
        Text(
          "PC と同じ",
          fontSize = 13.sp,
          fontWeight = FontWeight.Bold,
          color = ShiodokiColors.OnAccent,
          modifier = Modifier
            .background(ShiodokiColors.Accent, CircleShape)
            .padding(horizontal = 12.dp, vertical = 6.dp),
        )
      }
    }

    state.previous?.let { task ->
      ShortcutCard(
        icon = FocusIcons.History,
        caption = "スマホで前回",
        name = task.name,
        highlighted = false,
        onClick = { viewModel.select(task.id, task.name) },
      ) {
        Icon(Icons.Filled.PlayArrow, contentDescription = null, tint = ShiodokiColors.TextMuted)
      }
    }

    QuickAdd(viewModel)

    // The snackbar covers the end of the list, not the skip button.
    Box(Modifier.weight(1f)) {
      TaskList(
        groups = state.groups,
        highlightedId = viewModel.addedTaskId,
        onSelect = { viewModel.select(it.id, it.name) },
        onComplete = { taskId ->
          viewModel.complete(taskId)
          scope.launch {
            if (snackbarHostState.showCompletedWithUndo()) viewModel.undoComplete(taskId)
          }
        },
        modifier = Modifier.fillMaxSize(),
      )
      SnackbarHost(snackbarHostState, Modifier.align(Alignment.BottomCenter))
    }

    HoldToSkipButton(onSkip = viewModel::skip)
  }
}

/**
 * "スキップ" needs a [SKIP_HOLD_MS] hold, so the screen is not dismissed by reflex (M-14).
 * Releasing early resets it; the fill from the left shows the progress. TalkBack users get an
 * immediate long-click action instead, since holding is hard with a screen reader.
 */
@Composable
private fun HoldToSkipButton(onSkip: () -> Unit) {
  val progress = remember { Animatable(0f) }
  val scope = rememberCoroutineScope()
  val haptic = LocalHapticFeedback.current
  val currentOnSkip by rememberUpdatedState(onSkip)
  val shape = RoundedCornerShape(14.dp)
  Row(
    modifier = Modifier
      .fillMaxWidth()
      .height(52.dp)
      .clip(shape)
      .border(1.dp, ShiodokiColors.Outline, shape)
      // Read in the draw phase, so the animation only redraws.
      .drawBehind {
        drawRect(ShiodokiColors.Outline, size = size.copy(width = size.width * progress.value))
      }
      .pointerInput(Unit) {
        detectTapGestures(onPress = {
          val hold = scope.launch {
            // Throws when cancelled, so the skip runs only after the full hold.
            progress.animateTo(1f, tween(SKIP_HOLD_MS, easing = LinearEasing))
            haptic.performHapticFeedback(HapticFeedbackType.LongPress)
            currentOnSkip()
          }
          tryAwaitRelease()
          if (hold.isActive) {
            hold.cancel()
            progress.snapTo(0f)
          }
        })
      }
      .semantics(mergeDescendants = true) {
        role = Role.Button
        onLongClick(label = "スキップ") {
          currentOnSkip()
          true
        }
      },
    horizontalArrangement = Arrangement.Center,
    verticalAlignment = Alignment.CenterVertically,
  ) {
    Text("スキップ", fontSize = 15.sp, color = ShiodokiColors.Text)
    Text(
      "5秒長押しで記録せずに閉じる",
      fontSize = 12.sp,
      color = ShiodokiColors.TextMuted,
      modifier = Modifier.padding(start = 8.dp),
    )
  }
}

private const val SKIP_HOLD_MS = 5_000

/** "PC と同じ" and "スマホで前回": one tap starts that task. */
@Composable
private fun ShortcutCard(
  icon: ImageVector,
  caption: String,
  name: String,
  highlighted: Boolean,
  onClick: () -> Unit,
  trailing: @Composable () -> Unit,
) {
  val shape = RoundedCornerShape(14.dp)
  Row(
    modifier = Modifier
      .fillMaxWidth()
      .clip(shape)
      .background(if (highlighted) ShiodokiColors.SurfaceRaised else ShiodokiColors.Surface)
      .then(if (highlighted) Modifier.border(1.dp, ShiodokiColors.Accent, shape) else Modifier)
      .clickable(onClick = onClick)
      .padding(horizontal = 14.dp, vertical = 12.dp),
    verticalAlignment = Alignment.CenterVertically,
    horizontalArrangement = Arrangement.spacedBy(12.dp),
  ) {
    Box(
      Modifier
        .size(40.dp)
        .background(ShiodokiColors.NavIndicator, CircleShape)
        .then(if (highlighted) Modifier.border(3.dp, ShiodokiColors.Accent, CircleShape) else Modifier),
      contentAlignment = Alignment.Center,
    ) {
      Icon(icon, contentDescription = null, tint = ShiodokiColors.Text, modifier = Modifier.size(18.dp))
    }
    Column(Modifier.weight(1f)) {
      Text(caption, fontSize = 12.sp, color = ShiodokiColors.TextMuted)
      Text(
        name,
        fontSize = 15.sp,
        fontWeight = FontWeight.Bold,
        color = ShiodokiColors.TextStrong,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
      )
    }
    trailing()
  }
}

/** Adds a task with priority NOW without starting it (design §5.7, Q-A3). */
@Composable
private fun QuickAdd(viewModel: FocusViewModel) {
  Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.Top) {
    OutlinedTextField(
      value = viewModel.newTaskName,
      onValueChange = viewModel::onNewTaskNameChange,
      placeholder = { Text("新しいタスク（今すぐ）", color = ShiodokiColors.TextMuted) },
      singleLine = true,
      isError = viewModel.error != null,
      supportingText = viewModel.error?.let { { Text(it) } },
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
      Icon(Icons.Filled.Add, contentDescription = "タスクを追加")
    }
  }
}

@Composable
private fun TaskList(
  groups: List<PriorityGroup>?,
  highlightedId: String?,
  onSelect: (Task) -> Unit,
  onComplete: (taskId: String) -> Unit,
  modifier: Modifier,
) {
  when {
    groups == null -> Box(modifier.fillMaxWidth(), Alignment.Center) {
      CircularProgressIndicator(color = ShiodokiColors.Accent)
    }
    groups.isEmpty() -> Box(modifier.fillMaxWidth(), Alignment.Center) {
      Text("未完了のタスクはありません", color = ShiodokiColors.TextMuted)
    }
    else -> LazyColumn(
      modifier = modifier.fillMaxWidth(),
      contentPadding = PaddingValues(vertical = 4.dp),
      verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
      groups.forEachIndexed { index, group ->
        item(key = group.priority.name) {
          GroupHeader(group.priority, Modifier.padding(top = if (index == 0) 0.dp else 12.dp))
        }
        items(group.tasks, key = { it.id }) { task ->
          SwipeToComplete(onComplete = { onComplete(task.id) }, modifier = Modifier.animateItem()) {
            TaskRow(task, highlighted = task.id == highlightedId, onClick = { onSelect(task) })
          }
        }
      }
    }
  }
}

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

@Composable
private fun TaskRow(task: Task, highlighted: Boolean, onClick: () -> Unit) {
  val shape = RoundedCornerShape(12.dp)
  Row(
    modifier = Modifier
      .fillMaxWidth()
      .heightIn(min = 52.dp)
      .clip(shape)
      .background(ShiodokiColors.Surface)
      .then(if (highlighted) Modifier.border(1.dp, ShiodokiColors.Accent, shape) else Modifier)
      .clickable(onClick = onClick)
      .padding(horizontal = 14.dp),
    verticalAlignment = Alignment.CenterVertically,
    horizontalArrangement = Arrangement.spacedBy(12.dp),
  ) {
    Text(
      task.name,
      fontSize = 15.sp,
      color = ShiodokiColors.TextStrong,
      maxLines = 1,
      overflow = TextOverflow.Ellipsis,
      modifier = Modifier.weight(1f),
    )
    Text(
      formatMinutes(task.totalMinutes),
      fontFamily = MonoFamily,
      fontWeight = FontWeight.Medium,
      fontSize = 12.sp,
      color = ShiodokiColors.TextMuted,
    )
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
