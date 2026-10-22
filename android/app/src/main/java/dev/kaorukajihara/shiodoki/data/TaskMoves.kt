package dev.kaorukajihara.shiodoki.data

import dev.kaorukajihara.shiodoki.model.Priority
import dev.kaorukajihara.shiodoki.model.TaskDrop
import dev.kaorukajihara.shiodoki.model.TaskPatch
import dev.kaorukajihara.shiodoki.model.reorderPatches
import java.time.Instant

/** A drop that was written: what the snackbar tells and what undo restores (design §5.3). */
data class TaskMove(val taskId: String, val from: Priority, val to: Priority, val previousSortOrder: Double) {
  val priorityChanged: Boolean
    get() = from != to
}

/**
 * Writes a drop and returns what moved, or null when it changes nothing. With [keepPosition] false (the completed
 * list, design §5.5) only the priority changes: the task goes to the end of the new one, and the list stays in
 * completion order.
 */
fun TaskRepository.moveTask(drop: TaskDrop, keepPosition: Boolean = true, now: Instant = Instant.now()): TaskMove? {
  val tasks = snapshot.value?.tasks ?: return null
  val task = tasks.firstOrNull { it.id == drop.taskId && !it.deleted } ?: return null
  val patches = when {
    keepPosition -> reorderPatches(tasks, drop.taskId, drop.priority, drop.orderedIds, now)
    drop.priority != task.priority -> mapOf(task.id to TaskPatch(priority = drop.priority))
    else -> emptyMap()
  }
  when (patches.size) {
    0 -> return null
    1 -> patches.forEach { (id, patch) -> update(id, patch) }
    else -> updateAll(patches)
  }
  return TaskMove(task.id, from = task.priority, to = drop.priority, previousSortOrder = task.order)
}

/** "元に戻す" after a drop: the old priority and position. Other tasks renumbered by the drop keep their new numbers. */
fun TaskRepository.undoMove(move: TaskMove) = update(
  move.taskId,
  TaskPatch(priority = move.from.takeIf { move.priorityChanged }, sortOrder = move.previousSortOrder),
)
