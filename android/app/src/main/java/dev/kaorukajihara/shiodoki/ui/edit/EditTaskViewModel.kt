package dev.kaorukajihara.shiodoki.ui.edit

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import dev.kaorukajihara.shiodoki.data.TaskRepository
import dev.kaorukajihara.shiodoki.model.Priority
import dev.kaorukajihara.shiodoki.model.TaskInput
import dev.kaorukajihara.shiodoki.model.TaskPatch
import dev.kaorukajihara.shiodoki.model.diffTaskInput
import dev.kaorukajihara.shiodoki.model.normalizeTaskInput

/**
 * Add (taskId == null) or edit a task (design §5.4).
 *
 * The form is filled once from the task as it was when the screen opened and is never
 * overwritten by later snapshots. Saving sends only the fields the user changed against those
 * initial values, so concurrent edits of other fields on another device are kept (§5.3-2).
 */
class EditTaskViewModel(
  private val repository: TaskRepository,
  private val taskId: String?,
) : ViewModel() {
  private val initial: TaskInput? = if (taskId == null) {
    TaskInput(name = "", priority = Priority.DEFAULT, memo = "")
  } else {
    repository.snapshot.value?.tasks
      ?.find { it.id == taskId && !it.deleted }
      ?.let { TaskInput(name = it.name, priority = it.priority, memo = it.memo) }
  }

  val isNew: Boolean = taskId == null

  /** The task to edit is unknown (deleted elsewhere, or the list is not loaded yet). */
  val notFound: Boolean = initial == null

  var name by mutableStateOf(initial?.name.orEmpty())
    private set
  var priority by mutableStateOf(initial?.priority ?: Priority.DEFAULT)
  var memo by mutableStateOf(initial?.memo.orEmpty())

  /** Validation message to show, or null. */
  var error by mutableStateOf<String?>(null)
    private set

  fun onNameChange(value: String) {
    name = value
    error = null
  }

  /** Returns true when the screen should close. */
  fun save(): Boolean {
    val start = initial ?: return true
    val input = try {
      normalizeTaskInput(TaskInput(name = name, priority = priority, memo = memo))
    } catch (e: IllegalArgumentException) {
      error = e.message
      return false
    }
    if (taskId == null) {
      repository.add(input)
    } else {
      // Trim the stored values too, so untouched fields with stray whitespace are not sent.
      repository.update(taskId, diffTaskInput(trimmed(start), input))
    }
    return true
  }

  fun complete() = updateExisting(TaskPatch(completed = true))

  fun delete() = updateExisting(TaskPatch(deleted = true))

  private fun updateExisting(patch: TaskPatch) {
    if (taskId != null) repository.update(taskId, patch)
  }

  private fun trimmed(input: TaskInput) =
    input.copy(name = input.name.trim(), memo = input.memo.trim())
}
