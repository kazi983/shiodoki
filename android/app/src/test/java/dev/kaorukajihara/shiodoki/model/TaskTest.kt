package dev.kaorukajihara.shiodoki.model

import dev.kaorukajihara.shiodoki.task
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

/** Same cases as the desktop tests/shared.test.ts (except the Android duration format). */
class TaskTest {
  @Test
  fun `tasks sort by priority, then oldest first`() {
    val tasks = listOf(
      task("someday", priority = Priority.SOMEDAY),
      task("now-new", priority = Priority.NOW, createdAt = "2026-01-02T00:00:00Z"),
      task("sooner", priority = Priority.SOONER),
      task("now-old", priority = Priority.NOW, createdAt = "2026-01-01T00:00:00Z"),
      task("anytime", priority = Priority.ANYTIME),
    )
    assertEquals(
      listOf("now-old", "now-new", "sooner", "anytime", "someday"),
      tasks.sortedWith(taskOrder).map { it.id },
    )
  }

  @Test
  fun `normalizeTaskInput trims and validates`() {
    assertEquals(
      TaskInput(name = "a", priority = Priority.SOONER, memo = "m"),
      normalizeTaskInput(TaskInput(name = "  a ", priority = Priority.SOONER, memo = " m ")),
    )
    val empty = assertThrows(IllegalArgumentException::class.java) {
      normalizeTaskInput(TaskInput(name = "  ", priority = Priority.NOW, memo = ""))
    }
    assertEquals("タスク名を入力してください", empty.message)
    normalizeTaskInput(TaskInput(name = "a".repeat(200), priority = Priority.NOW, memo = ""))
    assertThrows(IllegalArgumentException::class.java) {
      normalizeTaskInput(TaskInput(name = "a".repeat(201), priority = Priority.NOW, memo = ""))
    }
    assertThrows(IllegalArgumentException::class.java) {
      normalizeTaskInput(TaskInput(name = "a", priority = Priority.NOW, memo = "m".repeat(5001)))
    }
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
    assertEquals("1h 00m", formatMinutes(60))
    assertEquals("2h 05m", formatMinutes(125))
  }

  @Test
  fun `unknown priority values are not accepted`() {
    assertEquals(Priority.SOONER, Priority.fromValue("SOONER"))
    assertEquals(null, Priority.fromValue("HIGH"))
    assertEquals(null, Priority.fromValue(null))
  }
}
