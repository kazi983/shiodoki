package dev.kaorukajihara.shiodoki.ui.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dev.kaorukajihara.shiodoki.data.SyncStatus
import dev.kaorukajihara.shiodoki.data.TaskRepository
import dev.kaorukajihara.shiodoki.data.TasksSnapshot
import dev.kaorukajihara.shiodoki.model.Priority
import dev.kaorukajihara.shiodoki.model.Task
import dev.kaorukajihara.shiodoki.model.TaskPatch
import dev.kaorukajihara.shiodoki.model.taskOrder
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn

/** Tasks of one priority, shown under a heading. */
data class PriorityGroup(val priority: Priority, val tasks: List<Task>)

data class HomeUiState(
  /** null until the first snapshot arrives. Priorities without tasks are left out. */
  val groups: List<PriorityGroup>?,
  val syncStatus: SyncStatus?,
)

/** Incomplete, not deleted tasks in the desktop order, grouped by priority (design §5.3). */
fun toHomeUiState(snapshot: TasksSnapshot?): HomeUiState = HomeUiState(
  groups = snapshot?.tasks
    ?.filter { !it.completed && !it.deleted }
    ?.sortedWith(taskOrder)
    ?.groupBy { it.priority }
    ?.map { (priority, tasks) -> PriorityGroup(priority, tasks) },
  syncStatus = snapshot?.syncStatus,
)

class HomeViewModel(private val repository: TaskRepository) : ViewModel() {
  val uiState: StateFlow<HomeUiState> = repository.snapshot
    .map(::toHomeUiState)
    .stateIn(
      viewModelScope,
      SharingStarted.WhileSubscribed(5_000),
      toHomeUiState(repository.snapshot.value),
    )

  val writeFailures: Flow<Unit> = repository.writeFailures

  fun complete(taskId: String) {
    repository.update(taskId, TaskPatch(completed = true))
  }
}
