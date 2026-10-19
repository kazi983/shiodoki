package dev.kaorukajihara.shiodoki.ui.focus

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dev.kaorukajihara.shiodoki.data.DesktopStateRepository
import dev.kaorukajihara.shiodoki.data.TaskRepository
import dev.kaorukajihara.shiodoki.data.TasksSnapshot
import dev.kaorukajihara.shiodoki.focus.FocusController
import dev.kaorukajihara.shiodoki.model.DesktopState
import dev.kaorukajihara.shiodoki.model.Priority
import dev.kaorukajihara.shiodoki.model.Task
import dev.kaorukajihara.shiodoki.model.TaskInput
import dev.kaorukajihara.shiodoki.model.TaskInputError
import dev.kaorukajihara.shiodoki.model.TaskInputException
import dev.kaorukajihara.shiodoki.model.TaskPatch
import dev.kaorukajihara.shiodoki.model.normalizeTaskInput
import dev.kaorukajihara.shiodoki.ui.home.PcStatus
import dev.kaorukajihara.shiodoki.ui.home.PriorityGroup
import dev.kaorukajihara.shiodoki.ui.home.toHomeUiState
import dev.kaorukajihara.shiodoki.ui.home.toPcStatus
import java.time.Instant
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn

/** The task the PC is working on, offered as "PC と同じ" (design §5.7). */
data class PcTask(val taskId: String, val taskName: String, val elapsedMinutes: Long?)

data class FocusUiState(
  /** null until the first snapshot arrives. */
  val groups: List<PriorityGroup>?,
  val pcTask: PcTask?,
  /** The phone's previous choice, only while it is still incomplete. */
  val previous: Task?,
)

/**
 * "PC と同じ" only while the PC runs a task and its heartbeat is fresh: the same check as the
 * home card ([toPcStatus]), so an offline PC is never offered.
 */
fun toPcTask(state: DesktopState?, now: Instant): PcTask? {
  val running = toPcStatus(state, now) as? PcStatus.Running ?: return null
  val taskId = state?.currentTaskId ?: return null
  return PcTask(taskId, running.taskName, running.elapsedMinutes)
}

fun toFocusUiState(snapshot: TasksSnapshot?, desktop: DesktopState?, lastSelectedTaskId: String?, now: Instant) =
  FocusUiState(
    groups = toHomeUiState(snapshot).groups,
    pcTask = toPcTask(desktop, now),
    previous = snapshot?.tasks?.find { it.id == lastSelectedTaskId && !it.completed && !it.deleted },
  )

/** Design §5.7. Selecting and skipping go to [FocusController]; the activity closes on its own. */
class FocusViewModel(
  private val repository: TaskRepository,
  desktopStateRepository: DesktopStateRepository,
  lastSelectedTaskId: Flow<String?>,
  private val controller: FocusController,
) : ViewModel() {
  val uiState: StateFlow<FocusUiState> =
    combine(repository.snapshot, desktopStateRepository.snapshot, lastSelectedTaskId) { tasks, desktop, last ->
      toFocusUiState(tasks, desktop?.state, last, Instant.now())
    }.stateIn(
      viewModelScope,
      SharingStarted.WhileSubscribed(5_000),
      // The task list is already in memory, so the screen is filled on the first frame (N-06).
      toFocusUiState(repository.snapshot.value, desktopStateRepository.snapshot.value?.state, null, Instant.now()),
    )

  var newTaskName by mutableStateOf("")
    private set

  /** Validation error of the quick add, or null. The screen turns it into a message. */
  var error by mutableStateOf<TaskInputError?>(null)
    private set

  /** The task just added with quick add, highlighted in the list (Q-A3: not started). */
  var addedTaskId by mutableStateOf<String?>(null)
    private set

  fun onNewTaskNameChange(value: String) {
    newTaskName = value
    error = null
  }

  fun quickAdd() {
    val input = try {
      normalizeTaskInput(TaskInput(name = newTaskName, priority = Priority.NOW, memo = ""))
    } catch (e: TaskInputException) {
      error = e.error
      return
    }
    addedTaskId = repository.add(input)
    newTaskName = ""
  }

  fun select(taskId: String, taskName: String) = controller.onTaskSelected(taskId, taskName)

  /** Swipe on a row (design §5.7): completes the task without closing the screen. */
  fun complete(taskId: String) = repository.update(taskId, TaskPatch(completed = true))

  /** "元に戻す" on the snackbar. Also clears `completedAt`. */
  fun undoComplete(taskId: String) = repository.update(taskId, TaskPatch(completed = false))
}
