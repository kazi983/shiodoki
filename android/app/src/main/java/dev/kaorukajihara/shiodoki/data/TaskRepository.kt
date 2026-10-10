package dev.kaorukajihara.shiodoki.data

import dev.kaorukajihara.shiodoki.model.Task
import dev.kaorukajihara.shiodoki.model.TaskInput
import dev.kaorukajihara.shiodoki.model.TaskPatch
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.StateFlow

/** Same three states as the desktop sync indicator (requirements D-06). Labels: `ui/Labels.kt`. */
enum class SyncStatus {
  SYNCED,
  PENDING,
  OFFLINE,
}

/** The latest task snapshot of the signed-in user, including completed and deleted tasks. */
data class TasksSnapshot(val tasks: List<Task>, val syncStatus: SyncStatus)

/**
 * Tasks of the signed-in user (design §4). Screens and the focus feature depend only on this
 * interface; tests use a fake.
 *
 * Writes return immediately: the local cache is updated at once and [snapshot] reflects it, while
 * the server write happens whenever the device is online (design §4.3).
 */
interface TaskRepository {
  /** null until the first snapshot arrives (or while signed out). */
  val snapshot: StateFlow<TasksSnapshot?>

  /** Emits once per write the server rejected (e.g. a rules violation). */
  val writeFailures: Flow<Unit>

  /** Creates a task and returns its new id. */
  fun add(input: TaskInput): String

  fun update(id: String, patch: TaskPatch)
}
