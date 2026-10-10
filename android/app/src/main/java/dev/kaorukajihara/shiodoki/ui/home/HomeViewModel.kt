package dev.kaorukajihara.shiodoki.ui.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dev.kaorukajihara.shiodoki.data.DesktopStateRepository
import dev.kaorukajihara.shiodoki.data.SyncStatus
import dev.kaorukajihara.shiodoki.data.TaskRepository
import dev.kaorukajihara.shiodoki.data.TasksSnapshot
import dev.kaorukajihara.shiodoki.model.Priority
import dev.kaorukajihara.shiodoki.model.Task
import dev.kaorukajihara.shiodoki.model.TaskPatch
import dev.kaorukajihara.shiodoki.model.taskOrder
import java.time.Instant
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flow
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

class HomeViewModel(
  private val repository: TaskRepository,
  desktopStateRepository: DesktopStateRepository,
) : ViewModel() {
  val uiState: StateFlow<HomeUiState> = repository.snapshot
    .map(::toHomeUiState)
    .stateIn(
      viewModelScope,
      SharingStarted.WhileSubscribed(5_000),
      toHomeUiState(repository.snapshot.value),
    )

  /**
   * null until `state/desktop` is loaded. Re-evaluated on a clock as well, because elapsed time and
   * the offline check change without a new document (design §5.3).
   */
  val pcStatus: StateFlow<PcStatus?> = combine(desktopStateRepository.snapshot, clock()) { snap, now ->
    snap?.let { toPcStatus(it.state, now) }
  }
    .distinctUntilChanged()
    .stateIn(
      viewModelScope,
      SharingStarted.WhileSubscribed(5_000),
      desktopStateRepository.snapshot.value?.let { toPcStatus(it.state, Instant.now()) },
    )

  val writeFailures: Flow<Unit> = repository.writeFailures

  fun complete(taskId: String) {
    repository.update(taskId, TaskPatch(completed = true))
  }

  /** "元に戻す" on the snackbar after a swipe. Also clears `completedAt`. */
  fun undoComplete(taskId: String) {
    repository.update(taskId, TaskPatch(completed = false))
  }
}

/**
 * The device time every [CLOCK_TICK_MS]. Shorter than a minute so the elapsed minutes lag by at
 * most a few seconds; [HomeViewModel.pcStatus] drops ticks that change nothing.
 */
private fun clock() = flow {
  while (true) {
    emit(Instant.now())
    delay(CLOCK_TICK_MS)
  }
}

private const val CLOCK_TICK_MS = 10_000L
