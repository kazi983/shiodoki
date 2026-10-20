package dev.kaorukajihara.shiodoki.ui.all

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dev.kaorukajihara.shiodoki.data.SyncStatus
import dev.kaorukajihara.shiodoki.data.TaskRepository
import dev.kaorukajihara.shiodoki.data.TasksSnapshot
import dev.kaorukajihara.shiodoki.model.Task
import dev.kaorukajihara.shiodoki.model.TaskPatch
import dev.kaorukajihara.shiodoki.ui.home.PriorityGroup
import dev.kaorukajihara.shiodoki.ui.home.toHomeUiState
import java.time.Duration
import java.time.Instant
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn

/** The two views of the All tab (design §5.5). */
enum class TaskFilter { OPEN, COMPLETED }

/** How far back the completed view goes (design §5.5). */
val COMPLETED_WINDOW: Duration = Duration.ofDays(30)

data class AllTasksUiState(
  val filter: TaskFilter,
  /** Open tasks grouped like Home. null until the first snapshot arrives. */
  val open: List<PriorityGroup>?,
  /** Tasks completed within [COMPLETED_WINDOW], newest first. null until the first snapshot arrives. */
  val completed: List<Task>?,
  val syncStatus: SyncStatus?,
)

/**
 * Completed, not deleted tasks whose `completedAt` is within [COMPLETED_WINDOW] of [now], newest
 * first. A completed task without `completedAt` is left out, since its age is unknown.
 */
fun recentlyCompleted(snapshot: TasksSnapshot?, now: Instant): List<Task>? {
  val since = now - COMPLETED_WINDOW
  return snapshot?.tasks
    ?.filter { it.completed && !it.deleted && it.completedAt?.let { at -> at >= since } == true }
    ?.sortedByDescending { it.completedAt }
}

fun toAllTasksUiState(snapshot: TasksSnapshot?, filter: TaskFilter, now: Instant): AllTasksUiState =
  AllTasksUiState(
    filter = filter,
    open = toHomeUiState(snapshot).groups,
    completed = recentlyCompleted(snapshot, now),
    syncStatus = snapshot?.syncStatus,
  )

/**
 * The All tab (design §5.5): open tasks or those completed in the last 30 days. Rows are swiped to
 * complete or reopen them, with undo on a snackbar. The view model lives with the tab's back stack
 * entry, so opening the tab again starts on [TaskFilter.OPEN].
 */
class AllTasksViewModel(private val repository: TaskRepository) : ViewModel() {
  private val filter = MutableStateFlow(TaskFilter.OPEN)

  val uiState: StateFlow<AllTasksUiState> = combine(repository.snapshot, filter) { snapshot, selected ->
    toAllTasksUiState(snapshot, selected, Instant.now())
  }
    .stateIn(
      viewModelScope,
      SharingStarted.WhileSubscribed(5_000),
      toAllTasksUiState(repository.snapshot.value, filter.value, Instant.now()),
    )

  val writeFailures: Flow<Unit> = repository.writeFailures

  fun selectFilter(value: TaskFilter) {
    filter.value = value
  }

  fun complete(taskId: String) = repository.update(taskId, TaskPatch(completed = true))

  /** Also clears `completedAt`. */
  fun reopen(taskId: String) = repository.update(taskId, TaskPatch(completed = false))
}
