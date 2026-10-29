package dev.kaorukajihara.shiodoki.model

import java.time.Instant

/**
 * Fixed priorities (requirements §5.5). The UI calls them categories (分類 / Category); the field
 * and the code keep the name priority. Labels are string resources (`ui/Labels.kt`) and colors
 * live in the UI theme. Declaration order is the sort order.
 */
enum class Priority {
  NOW,
  ROUTINE,
  SOONER,
  ANYTIME,
  SOMEDAY,
  BREAK,
  ;

  companion object {
    val DEFAULT = NOW

    fun fromValue(value: Any?): Priority? = entries.firstOrNull { it.name == value }
  }
}

/** A task document (requirements §5.1). Times are UTC instants, shown in the device time zone. */
data class Task(
  val id: String,
  val name: String,
  val memo: String,
  val priority: Priority,
  val completed: Boolean,
  val completedAt: Instant?,
  val deleted: Boolean,
  val totalMinutes: Long,
  val sessionCount: Long,
  val createdAt: Instant,
  val updatedAt: Instant,
  /**
   * Position within its priority (requirements §5.1); null on tasks written before it existed. Sort by
   * [order], which falls back to the creation time.
   */
  val sortOrder: Double? = null,
) {
  /** The position used for sorting: [sortOrder], or the creation time in epoch milliseconds (desktop `orderOf`). */
  val order: Double
    get() = sortOrder ?: createdAt.toEpochMilli().toDouble()
}

data class TaskInput(val name: String, val priority: Priority, val memo: String)

/**
 * Fields a client may change on an existing task; null means "unchanged". `completedAt` is not
 * here: it is derived from [completed] when writing, so the two never disagree.
 */
data class TaskPatch(
  val name: String? = null,
  val memo: String? = null,
  val priority: Priority? = null,
  val completed: Boolean? = null,
  val deleted: Boolean? = null,
  val sortOrder: Double? = null,
) {
  val isEmpty: Boolean
    get() = this == TaskPatch()
}

const val MAX_NAME_LENGTH = 200
const val MAX_MEMO_LENGTH = 5000

/** Why [normalizeTaskInput] rejected the input. The UI turns it into a message. */
enum class TaskInputError { NAME_EMPTY, NAME_TOO_LONG, MEMO_TOO_LONG }

class TaskInputException(val error: TaskInputError) : IllegalArgumentException(error.name)

/**
 * Trims and validates user input, like the desktop `normalizeTaskInput`.
 * Throws [TaskInputException] when it is invalid.
 */
fun normalizeTaskInput(input: TaskInput): TaskInput {
  val name = input.name.trim()
  val memo = input.memo.trim()
  val error = when {
    name.isEmpty() -> TaskInputError.NAME_EMPTY
    name.length > MAX_NAME_LENGTH -> TaskInputError.NAME_TOO_LONG
    memo.length > MAX_MEMO_LENGTH -> TaskInputError.MEMO_TOO_LONG
    else -> null
  }
  if (error != null) throw TaskInputException(error)
  return TaskInput(name = name, priority = input.priority, memo = memo)
}

/** Only the fields that differ between [before] and [after] (requirements §5.3-2). */
fun diffTaskInput(before: TaskInput, after: TaskInput): TaskPatch = TaskPatch(
  name = after.name.takeIf { it != before.name },
  memo = after.memo.takeIf { it != before.memo },
  priority = after.priority.takeIf { it != before.priority },
)

/** Priority order (NOW first), then [Task.order], then oldest first — the desktop `compareTasks`. */
val taskOrder: Comparator<Task> = compareBy<Task> { it.priority.ordinal }.thenBy { it.order }.thenBy { it.createdAt }

/** Gap between neighbors at the end of a priority: one second in [Task.order] units (desktop `SORT_ORDER_STEP`). */
const val SORT_ORDER_STEP = 1000.0

/**
 * The sortOrder that puts a task at the end of [priority] (requirements §5.5): after every other task there,
 * completed ones included so that reopening one keeps its place, and never before [now]. Like desktop
 * `endSortOrder`.
 */
fun endSortOrder(tasks: List<Task>, priority: Priority, now: Instant, excludeId: String? = null): Double {
  val last = tasks
    .filter { !it.deleted && it.priority == priority && it.id != excludeId }
    .maxOfOrNull { it.order + SORT_ORDER_STEP }
  return maxOf(now.toEpochMilli().toDouble(), last ?: Double.NEGATIVE_INFINITY)
}

/**
 * A patch that changes the priority without a position puts the task at the end of the new priority
 * (requirements §5.5): the edit screen, and a drop on the completed list (design §5.5).
 */
fun TaskPatch.withEndSortOrder(id: String, tasks: List<Task>, now: Instant): TaskPatch =
  if (priority == null || sortOrder != null) {
    this
  } else {
    copy(sortOrder = endSortOrder(tasks, priority, now, excludeId = id))
  }

/** A task dropped into [priority] at its place in [orderedIds], that priority's rows from top to bottom. */
data class TaskDrop(val taskId: String, val priority: Priority, val orderedIds: List<String>)

/**
 * The writes for dropping [taskId] into [priority] at its place in [orderedIds], that priority's rows from top
 * to bottom as shown at the drop (the moved task included). Ids that are no longer in [tasks] are skipped.
 *
 * Usually one patch: the moved task gets a sortOrder between its new neighbors (requirements §5.3: one
 * document per move). When no number fits between them, every task in [orderedIds] is renumbered. Empty when
 * the drop changes nothing.
 */
fun reorderPatches(
  tasks: List<Task>,
  taskId: String,
  priority: Priority,
  orderedIds: List<String>,
  now: Instant,
): Map<String, TaskPatch> {
  val byId = tasks.filter { !it.deleted }.associateBy { it.id }
  val moved = byId[taskId] ?: return emptyMap()
  val rows = orderedIds.mapNotNull { byId[it] }
  val index = rows.indexOfFirst { it.id == taskId }
  if (index < 0) return emptyMap()
  val before = rows.getOrNull(index - 1)
  val after = rows.getOrNull(index + 1)
  val newPriority = priority.takeIf { it != moved.priority }

  fun fits(value: Double) = (before == null || before.order < value) && (after == null || value < after.order)

  // Dropped where it was: nothing to write.
  if (newPriority == null && fits(moved.order)) return emptyMap()
  val order = when {
    before == null && after == null -> endSortOrder(tasks, priority, now, excludeId = taskId)
    before == null -> after!!.order - SORT_ORDER_STEP
    after == null -> before.order + SORT_ORDER_STEP
    else -> before.order + (after.order - before.order) / 2
  }
  if (fits(order)) return mapOf(taskId to TaskPatch(priority = newPriority, sortOrder = order))

  // Neighbors with equal orders, or so close that no double fits between them: number the rows again.
  val start = rows.minOf { it.order }
  return rows.withIndex().mapNotNull { (i, task) ->
    val value = start + i * SORT_ORDER_STEP
    val patch = TaskPatch(
      priority = newPriority.takeIf { task.id == taskId },
      sortOrder = value.takeIf { it != task.sortOrder },
    )
    if (patch.isEmpty) null else task.id to patch
  }.toMap()
}

/**
 * "—" / "45m" / "2h 5m": the same compact form as the desktop `formatDuration`, in every
 * language (docs/i18n/glossary.md Q-1).
 */
fun formatMinutes(totalMinutes: Long): String {
  val h = totalMinutes / 60
  val m = totalMinutes % 60
  return when {
    totalMinutes <= 0L -> "—"
    h == 0L -> "${m}m"
    else -> "${h}h ${m}m"
  }
}
