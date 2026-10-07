package dev.kaorukajihara.shiodoki.model

import java.time.Instant

/**
 * Fixed priorities (requirements §5.5). Labels and colors match the desktop `PRIORITY_META`
 * (`desktop/src/shared/task.ts`); declaration order is the sort order.
 */
enum class Priority(val icon: String, val label: String, val color: Long) {
  NOW("🔥", "今すぐ", 0xFFFEE2E2),
  SOONER("⭐", "近いうち", 0xFFFEF3C7),
  ANYTIME("📝", "いつでも", 0xFFDCFCE7),
  SOMEDAY("💤", "いつか", 0xFFF3F4F6),
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

/**
 * Trims and validates user input, like the desktop `normalizeTaskInput`.
 * Throws [IllegalArgumentException] with the same user-facing (Japanese) message.
 */
fun normalizeTaskInput(input: TaskInput): TaskInput {
  val name = input.name.trim()
  val memo = input.memo.trim()
  require(name.isNotEmpty()) { "タスク名を入力してください" }
  require(name.length <= MAX_NAME_LENGTH) { "タスク名は${MAX_NAME_LENGTH}文字以内にしてください" }
  require(memo.length <= MAX_MEMO_LENGTH) { "メモは${MAX_MEMO_LENGTH}文字以内にしてください" }
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

/** "45分" / "2時間5分", like the desktop `formatMinutes`. */
fun formatMinutes(totalMinutes: Long): String {
  val h = totalMinutes / 60
  val m = totalMinutes % 60
  return if (h == 0L) "${m}分" else "${h}時間${m}分"
}
