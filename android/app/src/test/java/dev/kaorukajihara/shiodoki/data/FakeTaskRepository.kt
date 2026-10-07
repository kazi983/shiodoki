package dev.kaorukajihara.shiodoki.data

import dev.kaorukajihara.shiodoki.model.Task
import dev.kaorukajihara.shiodoki.model.TaskInput
import dev.kaorukajihara.shiodoki.model.TaskPatch
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.emptyFlow

/** Records writes instead of applying them. */
class FakeTaskRepository(tasks: List<Task> = emptyList()) : TaskRepository {
  override val snapshot = MutableStateFlow<TasksSnapshot?>(TasksSnapshot(tasks, SyncStatus.SYNCED))
  override val writeFailures: Flow<Unit> = emptyFlow()

  val added = mutableListOf<TaskInput>()
  val updates = mutableListOf<Pair<String, TaskPatch>>()

  override fun add(input: TaskInput): String {
    added += input
    return "new-${added.size}"
  }

  override fun update(id: String, patch: TaskPatch) {
    if (!patch.isEmpty) updates += id to patch
  }
}
