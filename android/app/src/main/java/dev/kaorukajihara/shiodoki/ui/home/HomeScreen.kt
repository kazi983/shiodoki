package dev.kaorukajihara.shiodoki.ui.home

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.BottomAppBar
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dev.kaorukajihara.shiodoki.model.Task
import dev.kaorukajihara.shiodoki.model.formatMinutes
import dev.kaorukajihara.shiodoki.ui.components.PriorityLabel

/** Design §5.3: incomplete tasks and the sync status. The PC status card comes in step 4. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
  viewModel: HomeViewModel,
  onAddTask: () -> Unit,
  onEditTask: (taskId: String) -> Unit,
  onOpenSettings: () -> Unit,
) {
  val state by viewModel.uiState.collectAsStateWithLifecycle()
  val snackbarHostState = remember { SnackbarHostState() }
  // Only the id survives configuration changes; the task itself is looked up again.
  var confirmCompleteId by rememberSaveable { mutableStateOf<String?>(null) }

  LaunchedEffect(Unit) {
    viewModel.writeFailures.collect { snackbarHostState.showSnackbar("保存できませんでした") }
  }

  Scaffold(
    topBar = {
      TopAppBar(
        title = { Text("Shiodoki") },
        actions = {
          IconButton(onClick = onOpenSettings) {
            Icon(Icons.Filled.Settings, contentDescription = "設定")
          }
        },
      )
    },
    bottomBar = {
      BottomAppBar(
        actions = {
          Text(
            text = state.syncStatus?.label ?: "読み込み中",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(horizontal = 16.dp),
          )
        },
        floatingActionButton = {
          FloatingActionButton(onClick = onAddTask) {
            Icon(Icons.Filled.Add, contentDescription = "タスクを追加")
          }
        },
      )
    },
    snackbarHost = { SnackbarHost(snackbarHostState) },
  ) { padding ->
    val tasks = state.tasks
    when {
      tasks == null -> Box(Modifier.fillMaxSize().padding(padding), Alignment.Center) {
        CircularProgressIndicator()
      }
      tasks.isEmpty() -> Box(Modifier.fillMaxSize().padding(padding), Alignment.Center) {
        Text("未完了のタスクはありません", color = MaterialTheme.colorScheme.onSurfaceVariant)
      }
      else -> LazyColumn(contentPadding = padding, modifier = Modifier.fillMaxSize()) {
        items(tasks, key = { it.id }) { task ->
          TaskRow(
            task = task,
            onClick = { onEditTask(task.id) },
            onLongClick = { confirmCompleteId = task.id },
          )
          HorizontalDivider()
        }
      }
    }
  }

  val confirmTask = state.tasks?.find { it.id == confirmCompleteId }
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

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun TaskRow(task: Task, onClick: () -> Unit, onLongClick: () -> Unit) {
  Row(
    modifier = Modifier
      .fillMaxWidth()
      .combinedClickable(onClick = onClick, onLongClick = onLongClick)
      .padding(PaddingValues(horizontal = 16.dp, vertical = 14.dp)),
    verticalAlignment = Alignment.CenterVertically,
    horizontalArrangement = Arrangement.spacedBy(12.dp),
  ) {
    PriorityLabel(task.priority)
    Text(
      text = task.name,
      maxLines = 1,
      overflow = TextOverflow.Ellipsis,
      modifier = Modifier.weight(1f),
    )
    Text(
      text = formatMinutes(task.totalMinutes),
      style = MaterialTheme.typography.bodySmall,
      color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
  }
}
