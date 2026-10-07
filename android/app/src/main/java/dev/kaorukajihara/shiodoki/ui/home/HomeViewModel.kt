package dev.kaorukajihara.shiodoki.ui.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dev.kaorukajihara.shiodoki.data.SyncStatus
import dev.kaorukajihara.shiodoki.data.TaskRepository
import dev.kaorukajihara.shiodoki.data.TasksSnapshot
import dev.kaorukajihara.shiodoki.model.Task
import dev.kaorukajihara.shiodoki.model.TaskPatch
import dev.kaorukajihara.shiodoki.model.taskOrder
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn

data class HomeUiState(
  /** null until the first snapshot arrives. */
  val tasks: List<Task>?,
  val syncStatus: SyncStatus?,
)

/** Incomplete, not deleted tasks in the desktop order (design §5.3). */
fun toHomeUiState(snapshot: TasksSnapshot?): HomeUiState = HomeUiState(
  tasks = snapshot?.tasks?.filter { !it.completed && !it.deleted }?.sortedWith(taskOrder),
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
