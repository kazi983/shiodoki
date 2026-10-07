package dev.kaorukajihara.shiodoki.data

import com.google.firebase.Timestamp
import com.google.firebase.firestore.FieldValue
import dev.kaorukajihara.shiodoki.model.Priority
import dev.kaorukajihara.shiodoki.model.TaskInput
import dev.kaorukajihara.shiodoki.model.TaskPatch
import java.time.Instant
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class MappingTest {
  private val now = Timestamp(Instant.parse("2026-10-06T10:00:00Z"))

  @Test
  fun `newTaskDoc has every field the rules require`() {
    val doc = newTaskDoc(TaskInput(name = "a", priority = Priority.SOONER, memo = "m"), now)
    assertEquals(
      setOf(
        "name", "memo", "priority", "completed", "completedAt", "deleted", "totalMinutes",
        "sessionCount", "createdAt", "updatedAt", "updatedBy",
      ),
      doc.keys,
    )
    assertEquals("SOONER", doc["priority"])
    assertEquals(false, doc["completed"])
    assertNull(doc["completedAt"])
    // Long, so Firestore stores an integer (rules: `is int`).
    assertEquals(0L, doc["totalMinutes"])
    assertEquals(now, doc["createdAt"])
    assertTrue(doc["updatedAt"] is FieldValue)
    assertEquals("android", doc["updatedBy"])
  }

  @Test
  fun `patchToDoc sends only changed fields`() {
    val doc = patchToDoc(TaskPatch(name = "b"), now)
    assertEquals(setOf("name", "updatedAt", "updatedBy"), doc.keys)
  }

  @Test
  fun `patchToDoc derives completedAt from completed`() {
    val done = patchToDoc(TaskPatch(completed = true), now)
    assertEquals(true, done["completed"])
    assertEquals(now, done["completedAt"])

    val undone = patchToDoc(TaskPatch(completed = false), now)
    assertTrue(undone.containsKey("completedAt"))
    assertNull(undone["completedAt"])
  }

  @Test
  fun `docToTask reads a complete document`() {
    val created = Timestamp(Instant.parse("2026-01-01T00:00:00Z"))
    val task = docToTask(
      "t1",
      mapOf(
        "name" to "a", "memo" to "m", "priority" to "ANYTIME", "completed" to true,
        "completedAt" to now, "deleted" to false, "totalMinutes" to 125L, "sessionCount" to 3L,
        "createdAt" to created, "updatedAt" to now, "updatedBy" to "desktop",
      ),
    )
    assertEquals("t1", task.id)
    assertEquals(Priority.ANYTIME, task.priority)
    assertTrue(task.completed)
    assertEquals(now.toInstant(), task.completedAt)
    assertEquals(125L, task.totalMinutes)
    assertEquals(3L, task.sessionCount)
    assertEquals(created.toInstant(), task.createdAt)
  }

  @Test
  fun `docToTask falls back to defaults for unexpected values`() {
    val fallback = Instant.parse("2026-10-06T00:00:00Z")
    val task = docToTask(
      "t1",
      mapOf("name" to 1, "priority" to "HIGH", "completed" to "yes", "totalMinutes" to 2.0),
      now = fallback,
    )
    assertEquals("", task.name)
    assertEquals("", task.memo)
    assertEquals(Priority.SOMEDAY, task.priority)
    assertFalse(task.completed)
    assertNull(task.completedAt)
    assertEquals(2L, task.totalMinutes)
    assertEquals(0L, task.sessionCount)
    assertEquals(fallback, task.createdAt)
  }
}
