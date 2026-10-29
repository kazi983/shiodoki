package dev.kaorukajihara.shiodoki.model

import dev.kaorukajihara.shiodoki.task
import java.time.Instant
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

/** Same cases as the desktop tests/shared.test.ts (except the Android duration format). */
class TaskTest {
  @Test
  fun `tasks sort by priority, then oldest first`() {
    val tasks = listOf(
      task("break", priority = Priority.BREAK),
      task("someday", priority = Priority.SOMEDAY),
      task("now-new", priority = Priority.NOW, createdAt = "2026-01-02T00:00:00Z"),
      task("sooner", priority = Priority.SOONER),
      task("now-old", priority = Priority.NOW, createdAt = "2026-01-01T00:00:00Z"),
      task("anytime", priority = Priority.ANYTIME),
      task("routine", priority = Priority.ROUTINE),
    )
    assertEquals(
      listOf("now-old", "now-new", "routine", "sooner", "anytime", "someday", "break"),
      tasks.sortedWith(taskOrder).map { it.id },
    )
  }

  @Test
  fun `tasks sort by sortOrder within a priority, tasks without one by their creation time`() {
    val tasks = listOf(
      task("old", createdAt = "2026-10-01T00:00:00Z"),
      task("moved-first", createdAt = "2026-10-05T00:00:00Z", sortOrder = millis("2026-09-01T00:00:00Z")),
      task("new", createdAt = "2026-10-03T00:00:00Z"),
      task("between", createdAt = "2026-10-06T00:00:00Z", sortOrder = millis("2026-10-02T00:00:00Z")),
    )
    assertEquals(listOf("moved-first", "old", "between", "new"), tasks.sortedWith(taskOrder).map { it.id })
  }

  @Test
  fun `endSortOrder goes after every task of the priority, and not before now`() {
    val now = Instant.parse("2026-10-10T00:00:00Z")
    val late = millis("2026-10-20T00:00:00Z")
    val tasks = listOf(
      task("a", sortOrder = late),
      task("done", completed = true, sortOrder = late + 5000),
      task("gone", deleted = true, sortOrder = late + 9000),
      task("other", priority = Priority.SOMEDAY, sortOrder = late + 9000),
    )
    assertEquals(late + 6000, endSortOrder(tasks, Priority.NOW, now), 0.0)
    assertEquals(late + 1000, endSortOrder(tasks, Priority.NOW, now, excludeId = "done"), 0.0)
    assertEquals(now.toEpochMilli().toDouble(), endSortOrder(tasks, Priority.ANYTIME, now), 0.0)
  }

  @Test
  fun `a priority change without a position goes to the end of the new priority`() {
    val now = Instant.parse("2026-01-01T00:00:00Z")
    val tasks = listOf(task("a", priority = Priority.SOMEDAY, sortOrder = 5e12))
    assertEquals(5e12 + 1000, TaskPatch(priority = Priority.SOMEDAY).withEndSortOrder("b", tasks, now).sortOrder)
    // An explicit position (a drop, undo) and other fields stay as they are.
    val placed = TaskPatch(priority = Priority.SOMEDAY, sortOrder = 7.0)
    assertEquals(placed, placed.withEndSortOrder("b", tasks, now))
    assertEquals(TaskPatch(name = "x"), TaskPatch(name = "x").withEndSortOrder("b", tasks, now))
  }

  private val now = Instant.parse("2026-10-21T00:00:00Z")
  private val open = listOf(
    task("a", sortOrder = 1000.0),
    task("b", sortOrder = 2000.0),
    task("c", sortOrder = 3000.0),
    task("s1", priority = Priority.SOONER, sortOrder = 1000.0),
  )

  @Test
  fun `a drop between two tasks writes only the moved one, halfway between them`() {
    assertEquals(
      mapOf("c" to TaskPatch(sortOrder = 1500.0)),
      reorderPatches(open, "c", Priority.NOW, listOf("a", "c", "b"), now),
    )
  }

  @Test
  fun `a drop at the top or the bottom goes one step past the neighbor`() {
    assertEquals(
      mapOf("c" to TaskPatch(sortOrder = 0.0)),
      reorderPatches(open, "c", Priority.NOW, listOf("c", "a", "b"), now),
    )
    assertEquals(
      mapOf("a" to TaskPatch(sortOrder = 4000.0)),
      reorderPatches(open, "a", Priority.NOW, listOf("b", "c", "a"), now),
    )
  }

  @Test
  fun `a drop under another heading changes the priority too`() {
    assertEquals(
      mapOf("b" to TaskPatch(priority = Priority.SOONER, sortOrder = 2000.0)),
      reorderPatches(open, "b", Priority.SOONER, listOf("s1", "b"), now),
    )
    // Alone in a priority without tasks: the end of it.
    assertEquals(
      mapOf("b" to TaskPatch(priority = Priority.BREAK, sortOrder = now.toEpochMilli().toDouble())),
      reorderPatches(open, "b", Priority.BREAK, listOf("b"), now),
    )
  }

  @Test
  fun `a drop where the task already was writes nothing`() {
    assertEquals(emptyMap<String, TaskPatch>(), reorderPatches(open, "b", Priority.NOW, listOf("a", "b", "c"), now))
    assertEquals(emptyMap<String, TaskPatch>(), reorderPatches(open, "missing", Priority.NOW, listOf("a"), now))
  }

  @Test
  fun `tasks without a position use their creation time as neighbors`() {
    val tasks = listOf(
      task("old", createdAt = "2026-10-01T00:00:00Z"),
      task("new", createdAt = "2026-10-02T00:00:00Z"),
      task("moved", createdAt = "2026-10-03T00:00:00Z"),
    )
    val between = (millis("2026-10-01T00:00:00Z") + millis("2026-10-02T00:00:00Z")) / 2
    assertEquals(
      mapOf("moved" to TaskPatch(sortOrder = between)),
      reorderPatches(tasks, "moved", Priority.NOW, listOf("old", "moved", "new"), now),
    )
  }

  @Test
  fun `neighbors without room between them renumber the priority`() {
    // The same creation time and no position: nothing fits between "a" and "b".
    val tasks = listOf(task("a"), task("b"), task("c", sortOrder = 0.0))
    assertEquals(
      mapOf(
        "a" to TaskPatch(sortOrder = 0.0),
        "c" to TaskPatch(sortOrder = 1000.0),
        "b" to TaskPatch(sortOrder = 2000.0),
      ),
      reorderPatches(tasks, "c", Priority.NOW, listOf("a", "c", "b"), now),
    )
  }

  @Test
  fun `normalizeTaskInput trims and validates`() {
    assertEquals(
      TaskInput(name = "a", priority = Priority.SOONER, memo = "m"),
      normalizeTaskInput(TaskInput(name = "  a ", priority = Priority.SOONER, memo = " m ")),
    )
    fun errorOf(input: TaskInput) = assertThrows(TaskInputException::class.java) { normalizeTaskInput(input) }.error
    assertEquals(TaskInputError.NAME_EMPTY, errorOf(TaskInput(name = "  ", priority = Priority.NOW, memo = "")))
    normalizeTaskInput(TaskInput(name = "a".repeat(200), priority = Priority.NOW, memo = ""))
    assertEquals(
      TaskInputError.NAME_TOO_LONG,
      errorOf(TaskInput(name = "a".repeat(201), priority = Priority.NOW, memo = "")),
    )
    assertEquals(
      TaskInputError.MEMO_TOO_LONG,
      errorOf(TaskInput(name = "a", priority = Priority.NOW, memo = "m".repeat(5001))),
    )
  }

  @Test
  fun `diffTaskInput keeps only changed fields`() {
    val before = TaskInput(name = "a", priority = Priority.NOW, memo = "m")
    assertTrue(diffTaskInput(before, before).isEmpty)
    assertEquals(
      TaskPatch(priority = Priority.SOMEDAY),
      diffTaskInput(before, before.copy(priority = Priority.SOMEDAY)),
    )
    assertEquals(
      TaskPatch(name = "b", memo = ""),
      diffTaskInput(before, TaskInput(name = "b", priority = Priority.NOW, memo = "")),
    )
  }

  @Test
  fun formatMinutes() {
    assertEquals("—", formatMinutes(0))
    assertEquals("45m", formatMinutes(45))
    assertEquals("1h 0m", formatMinutes(60))
    assertEquals("2h 5m", formatMinutes(125))
  }

  @Test
  fun `unknown priority values are not accepted`() {
    assertEquals(Priority.SOONER, Priority.fromValue("SOONER"))
    assertEquals(null, Priority.fromValue("HIGH"))
    assertEquals(null, Priority.fromValue(null))
  }

  private fun millis(iso: String) = Instant.parse(iso).toEpochMilli().toDouble()
}
