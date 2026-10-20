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
)

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

/** Priority order (NOW first), then oldest first — the desktop `compareTasks`. */
val taskOrder: Comparator<Task> = compareBy<Task> { it.priority.ordinal }.thenBy { it.createdAt }

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
