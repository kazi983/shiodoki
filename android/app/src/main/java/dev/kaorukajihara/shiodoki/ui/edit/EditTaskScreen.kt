package dev.kaorukajihara.shiodoki.ui.edit

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import dev.kaorukajihara.shiodoki.model.Priority
import dev.kaorukajihara.shiodoki.ui.components.PriorityTextColor

private enum class Confirm(val title: String, val action: String) {
  COMPLETE("完了にしますか？", "完了"),
  DELETE("削除しますか？", "削除"),
}

/** Design §5.4. Saving does not wait for the write; the screen closes at once (§4.3). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EditTaskScreen(viewModel: EditTaskViewModel, onClose: () -> Unit) {
  var confirm by rememberSaveable { mutableStateOf<Confirm?>(null) }

  Scaffold(
    topBar = {
      TopAppBar(
        title = { Text(if (viewModel.isNew) "タスクを追加" else "タスクを編集") },
        navigationIcon = {
          IconButton(onClick = onClose) {
            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "戻る")
          }
        },
        actions = {
          if (!viewModel.notFound) {
            TextButton(onClick = { if (viewModel.save()) onClose() }) { Text("保存") }
          }
        },
      )
    },
  ) { padding ->
    if (viewModel.notFound) {
      Text(
        "タスクが見つかりません",
        modifier = Modifier.padding(padding).padding(16.dp),
        color = MaterialTheme.colorScheme.onSurfaceVariant,
      )
      return@Scaffold
    }
    Column(
      modifier = Modifier
        .fillMaxSize()
        .padding(padding)
        .imePadding()
        .verticalScroll(rememberScrollState())
        .padding(16.dp),
      verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
      OutlinedTextField(
        value = viewModel.name,
        onValueChange = viewModel::onNameChange,
        label = { Text("タスク名") },
        singleLine = true,
        isError = viewModel.error != null,
        supportingText = viewModel.error?.let { { Text(it) } },
        modifier = Modifier.fillMaxWidth(),
      )
      FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Priority.entries.forEach { p ->
          FilterChip(
            selected = viewModel.priority == p,
            onClick = { viewModel.priority = p },
            label = { Text("${p.icon} ${p.label}") },
            colors = FilterChipDefaults.filterChipColors(
              selectedContainerColor = Color(p.color),
              selectedLabelColor = PriorityTextColor,
            ),
          )
        }
      }
      OutlinedTextField(
        value = viewModel.memo,
        onValueChange = { viewModel.memo = it },
        label = { Text("メモ") },
        minLines = 4,
        modifier = Modifier.fillMaxWidth(),
      )
      if (!viewModel.isNew) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
          OutlinedButton(onClick = { confirm = Confirm.COMPLETE }) { Text("完了にする") }
          OutlinedButton(onClick = { confirm = Confirm.DELETE }) {
            Text("削除", color = MaterialTheme.colorScheme.error)
          }
        }
      }
    }
  }

  confirm?.let { c ->
    AlertDialog(
      onDismissRequest = { confirm = null },
      title = { Text(c.title) },
      text = { Text(viewModel.name) },
      confirmButton = {
        TextButton(onClick = {
          confirm = null
          when (c) {
            Confirm.COMPLETE -> viewModel.complete()
            Confirm.DELETE -> viewModel.delete()
          }
          onClose()
        }) { Text(c.action) }
      },
      dismissButton = {
        TextButton(onClick = { confirm = null }) { Text("キャンセル") }
      },
    )
  }
}
