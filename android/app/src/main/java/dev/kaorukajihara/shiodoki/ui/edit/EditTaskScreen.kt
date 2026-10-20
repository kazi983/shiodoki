package dev.kaorukajihara.shiodoki.ui.edit

import androidx.annotation.StringRes
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.kaorukajihara.shiodoki.R
import dev.kaorukajihara.shiodoki.model.Priority
import dev.kaorukajihara.shiodoki.model.Task
import dev.kaorukajihara.shiodoki.model.formatMinutes
import dev.kaorukajihara.shiodoki.ui.labelRes
import dev.kaorukajihara.shiodoki.ui.message
import dev.kaorukajihara.shiodoki.ui.rememberDateFormatter
import dev.kaorukajihara.shiodoki.ui.theme.MonoFamily
import dev.kaorukajihara.shiodoki.ui.theme.ShiodokiColors
import dev.kaorukajihara.shiodoki.ui.theme.color
import dev.kaorukajihara.shiodoki.ui.theme.selectedFill
import dev.kaorukajihara.shiodoki.ui.theme.selectedText
import java.time.ZoneId

private enum class Confirm(@StringRes val title: Int, @StringRes val action: Int) {
  COMPLETE(R.string.edit_confirm_complete, R.string.complete),
  DELETE(R.string.edit_confirm_delete, R.string.delete),
}

/**
 * Design §5.4 and the "タスク編集" artboard. Saving does not wait for the write; the screen closes
 * at once (§4.3). The artboard's "PC で次にやる" switch comes with M-08 (P6).
 */
@Composable
fun EditTaskScreen(viewModel: EditTaskViewModel, onClose: () -> Unit) {
  var confirm by rememberSaveable { mutableStateOf<Confirm?>(null) }

  Scaffold(
    topBar = {
      Row(
        modifier = Modifier
          .fillMaxWidth()
          .statusBarsPadding()
          .padding(start = 12.dp, end = 12.dp, top = 8.dp, bottom = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
      ) {
        IconButton(onClick = onClose) {
          Icon(
            Icons.AutoMirrored.Filled.ArrowBack,
            contentDescription = stringResource(R.string.back),
            tint = ShiodokiColors.Text,
          )
        }
        Text(
          stringResource(if (viewModel.isNew) R.string.add_task else R.string.edit_title_edit),
          fontSize = 20.sp,
          fontWeight = FontWeight.Bold,
          color = ShiodokiColors.TextStrong,
        )
      }
    },
    bottomBar = {
      if (!viewModel.notFound) {
        Footer(
          isNew = viewModel.isNew,
          // A completed task (opened from the All tab) is reopened by a swipe there instead.
          canComplete = viewModel.original?.completed != true,
          onSave = { if (viewModel.save()) onClose() },
          onComplete = { confirm = Confirm.COMPLETE },
          onDelete = { confirm = Confirm.DELETE },
        )
      }
    },
  ) { padding ->
    if (viewModel.notFound) {
      Text(
        stringResource(R.string.edit_not_found),
        modifier = Modifier.padding(padding).padding(24.dp),
        color = ShiodokiColors.TextMuted,
      )
      return@Scaffold
    }
    Column(
      modifier = Modifier
        .fillMaxSize()
        .padding(padding)
        .verticalScroll(rememberScrollState())
        .padding(start = 24.dp, end = 24.dp, top = 12.dp, bottom = 32.dp),
      verticalArrangement = Arrangement.spacedBy(28.dp),
    ) {
      Field(stringResource(R.string.edit_name)) {
        OutlinedTextField(
          value = viewModel.name,
          onValueChange = viewModel::onNameChange,
          singleLine = true,
          isError = viewModel.error != null,
          supportingText = viewModel.error?.let { { Text(it.message()) } },
          textStyle = TextStyle(fontSize = 16.sp),
          shape = InputShape,
          colors = inputColors(),
          modifier = Modifier.fillMaxWidth(),
        )
      }
      Field(stringResource(R.string.edit_priority)) {
        PrioritySelector(viewModel.priority, onSelect = { viewModel.priority = it })
      }
      Field(stringResource(R.string.edit_memo)) {
        OutlinedTextField(
          value = viewModel.memo,
          onValueChange = { viewModel.memo = it },
          minLines = 4,
          textStyle = TextStyle(fontSize = 15.sp, lineHeight = 24.sp),
          shape = InputShape,
          colors = inputColors(),
          modifier = Modifier.fillMaxWidth(),
        )
      }
      viewModel.original?.let { Stats(it) }
    }
  }

  confirm?.let { c ->
    AlertDialog(
      onDismissRequest = { confirm = null },
      title = { Text(stringResource(c.title)) },
      text = { Text(viewModel.name) },
      confirmButton = {
        TextButton(onClick = {
          confirm = null
          when (c) {
            Confirm.COMPLETE -> viewModel.complete()
            Confirm.DELETE -> viewModel.delete()
          }
          onClose()
        }) { Text(stringResource(c.action)) }
      },
      dismissButton = {
        TextButton(onClick = { confirm = null }) { Text(stringResource(R.string.cancel)) }
      },
    )
  }
}

private val InputShape = RoundedCornerShape(12.dp)

@Composable
private fun inputColors() = OutlinedTextFieldDefaults.colors(
  focusedContainerColor = ShiodokiColors.Surface,
  unfocusedContainerColor = ShiodokiColors.Surface,
  errorContainerColor = ShiodokiColors.Surface,
  focusedTextColor = ShiodokiColors.TextStrong,
  unfocusedTextColor = ShiodokiColors.TextStrong,
  unfocusedBorderColor = ShiodokiColors.Outline,
  focusedBorderColor = ShiodokiColors.Accent,
  cursorColor = ShiodokiColors.Accent,
)

/** A small caption above its control. */
@Composable
private fun Field(label: String, content: @Composable () -> Unit) {
  Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
    Text(label, fontSize = 12.sp, color = ShiodokiColors.TextMuted)
    content()
  }
}

/** Four equal buttons; the selected one takes its priority color. */
@Composable
private fun PrioritySelector(selected: Priority, onSelect: (Priority) -> Unit) {
  Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
    Priority.entries.forEach { p ->
      val isSelected = p == selected
      OutlinedButton(
        onClick = { onSelect(p) },
        shape = RoundedCornerShape(12.dp),
        border = BorderStroke(1.dp, if (isSelected) p.color else ShiodokiColors.Outline),
        colors = ButtonDefaults.outlinedButtonColors(
          containerColor = if (isSelected) p.selectedFill else ShiodokiColors.Background,
          contentColor = if (isSelected) p.selectedText else ShiodokiColors.Text,
        ),
        contentPadding = PaddingValues(0.dp),
        modifier = Modifier
          .weight(1f)
          .height(48.dp)
          .semantics {
            role = Role.RadioButton
            this.selected = isSelected
          },
      ) {
        Text(
          stringResource(p.labelRes),
          fontSize = 13.sp,
          fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal,
          maxLines = 1,
        )
      }
    }
  }
}

/** 累計 / セッション / 作成日 of an existing task. */
@Composable
private fun Stats(task: Task) {
  val created = task.createdAt.atZone(ZoneId.systemDefault()).format(rememberDateFormatter())
  Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
    Stat(stringResource(R.string.edit_total), formatMinutes(task.totalMinutes), Modifier.weight(1f))
    Stat(stringResource(R.string.edit_sessions), task.sessionCount.toString(), Modifier.weight(1f))
    Stat(stringResource(R.string.edit_created), created, Modifier.weight(1f))
  }
}

@Composable
private fun Stat(label: String, value: String, modifier: Modifier) {
  Column(
    modifier = modifier
      .background(ShiodokiColors.Surface, RoundedCornerShape(12.dp))
      .padding(horizontal = 12.dp, vertical = 10.dp),
  ) {
    Text(label, fontSize = 11.sp, color = ShiodokiColors.TextMuted)
    Text(
      value,
      fontFamily = MonoFamily,
      fontWeight = FontWeight.SemiBold,
      fontSize = 16.sp,
      color = ShiodokiColors.TextStrong,
    )
  }
}

@Composable
private fun Footer(
  isNew: Boolean,
  canComplete: Boolean,
  onSave: () -> Unit,
  onComplete: () -> Unit,
  onDelete: () -> Unit,
) {
  // imePadding: keep the save button above the keyboard while typing.
  Column(Modifier.navigationBarsPadding().imePadding()) {
    HorizontalDivider(color = ShiodokiColors.Divider)
    Column(
      modifier = Modifier.padding(start = 24.dp, end = 24.dp, top = 16.dp, bottom = 20.dp),
      verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
      Button(
        onClick = onSave,
        shape = RoundedCornerShape(14.dp),
        colors = ButtonDefaults.buttonColors(
          containerColor = ShiodokiColors.Accent,
          contentColor = ShiodokiColors.OnAccent,
        ),
        modifier = Modifier.fillMaxWidth().height(52.dp),
      ) {
        Text(stringResource(if (isNew) R.string.edit_add else R.string.edit_save), fontSize = 16.sp, fontWeight = FontWeight.Bold)
      }
      if (!isNew) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
          if (canComplete) {
            OutlinedButton(
              onClick = onComplete,
              shape = RoundedCornerShape(14.dp),
              border = BorderStroke(1.dp, ShiodokiColors.Outline),
              colors = ButtonDefaults.outlinedButtonColors(contentColor = ShiodokiColors.Text),
              modifier = Modifier.weight(1f).height(48.dp),
            ) {
              Icon(Icons.Filled.Check, contentDescription = null, modifier = Modifier.size(16.dp))
              Text(stringResource(R.string.edit_mark_done), fontSize = 14.sp, modifier = Modifier.padding(start = 6.dp))
            }
          }
          TextButton(
            onClick = onDelete,
            shape = RoundedCornerShape(14.dp),
            colors = ButtonDefaults.textButtonColors(contentColor = ShiodokiColors.Danger),
            modifier = Modifier.weight(1f).height(48.dp),
          ) {
            Icon(Icons.Filled.Delete, contentDescription = null, modifier = Modifier.size(16.dp))
            Text(stringResource(R.string.delete), fontSize = 14.sp, modifier = Modifier.padding(start = 6.dp))
          }
        }
      }
    }
  }
}
