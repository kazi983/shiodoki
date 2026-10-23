package dev.kaorukajihara.shiodoki.data

import com.google.firebase.Timestamp
import com.google.firebase.firestore.FieldValue
import dev.kaorukajihara.shiodoki.model.DesktopStatus
import dev.kaorukajihara.shiodoki.model.EndReason
import dev.kaorukajihara.shiodoki.model.FinishedSession
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
    val doc = newTaskDoc(TaskInput(name = "a", priority = Priority.SOONER, memo = "m"), now, sortOrder = 1234.5)
    assertEquals(
      setOf(
        "name", "memo", "priority", "completed", "completedAt", "deleted", "totalMinutes",
        "sessionCount", "createdAt", "updatedAt", "updatedBy", "sortOrder",
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
    assertEquals(1234.5, doc["sortOrder"])
  }

  @Test
  fun `patchToDoc writes sortOrder only when it changes`() {
    assertEquals(2.5, patchToDoc(TaskPatch(priority = Priority.NOW, sortOrder = 2.5), now)["sortOrder"])
    assertFalse("sortOrder" in patchToDoc(TaskPatch(name = "a"), now))
  }

  @Test
  fun `docToTask reads sortOrder, which older documents do not have`() {
    assertEquals(12.5, docToTask("t1", mapOf("sortOrder" to 12.5)).sortOrder)
    // A whole number comes back from Firestore as a Long.
    assertEquals(1000.0, docToTask("t1", mapOf("sortOrder" to 1000L)).sortOrder)
    assertNull(docToTask("t1", mapOf()).sortOrder)
    assertNull(docToTask("t1", mapOf("sortOrder" to "1")).sortOrder)
    assertNull(docToTask("t1", mapOf("sortOrder" to Double.NaN)).sortOrder)
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
  fun `sessionToDoc has exactly the fields the rules allow`() {
    val start = Instant.parse("2026-10-09T05:00:00Z")
    val session = FinishedSession("s1", "t1", "英単語", start, start.plusSeconds(150), EndReason.SCREEN_OFF)
    val doc = sessionToDoc(session, "Pixel")
    assertEquals(
      setOf("taskId", "taskName", "startedAt", "endedAt", "elapsedMinutes", "endReason", "device"),
      doc.keys,
    )
    assertEquals(Timestamp(start), doc["startedAt"])
    assertEquals(Timestamp(start.plusSeconds(150)), doc["endedAt"])
    // An integer, as the rules require.
    assertEquals(2L, doc["elapsedMinutes"])
    assertEquals("screen_off", doc["endReason"])
    assertEquals("Pixel", doc["device"])
  }

  @Test
  fun `sessionToDoc cuts the name and device to the rule limits`() {
    val start = Instant.parse("2026-10-09T05:00:00Z")
    val session = FinishedSession("s1", "t1", "a".repeat(250), start, start, EndReason.INTERVAL)
    val doc = sessionToDoc(session, "d".repeat(150))
    assertEquals(200, (doc["taskName"] as String).length)
    assertEquals(100, (doc["device"] as String).length)
  }

  @Test
  fun `sessionCountersDoc increments the counters and stamps the write`() {
    val start = Instant.parse("2026-10-09T05:00:00Z")
    val session = FinishedSession("s1", "t1", "a", start, start.plusSeconds(600), EndReason.SCREEN_OFF)
    val doc = sessionCountersDoc(session)
    assertEquals(setOf("totalMinutes", "sessionCount", "updatedAt", "updatedBy"), doc.keys)
    // FieldValue.increment() has no equals(), so only check that it is not a plain number:
    // writing a number would overwrite the totals instead of adding to them.
    assertTrue(doc["totalMinutes"] is FieldValue)
    assertTrue(doc["sessionCount"] is FieldValue)
    assertEquals(FieldValue.serverTimestamp(), doc["updatedAt"])
    assertEquals("android", doc["updatedBy"])
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

  @Test
  fun `docToDesktopState reads the desktop document`() {
    val started = Timestamp(Instant.parse("2026-10-06T09:50:00Z"))
    val next = Timestamp(Instant.parse("2026-10-06T10:20:00Z"))
    val state = docToDesktopState(
      mapOf(
        "status" to "running", "currentTaskId" to "t1", "currentTaskName" to "a",
        "startedAt" to started, "nextPromptAt" to next, "heartbeatAt" to now, "device" to "pc",
      ),
    )!!
    assertEquals(DesktopStatus.RUNNING, state.status)
    assertEquals("t1", state.currentTaskId)
    assertEquals("a", state.currentTaskName)
    assertEquals(started.toInstant(), state.startedAt)
    assertEquals(next.toInstant(), state.nextPromptAt)
    assertEquals(now.toInstant(), state.heartbeatAt)
    assertEquals("pc", state.device)
  }

  @Test
  fun `docToDesktopState maps every desktop status`() {
    for ((value, status) in listOf(
      "idle" to DesktopStatus.IDLE,
      "snoozed" to DesktopStatus.SNOOZED,
      "leave_blocked" to DesktopStatus.LEAVE_BLOCKED,
      "stopped" to DesktopStatus.STOPPED,
    )) {
      assertEquals(status, docToDesktopState(mapOf("status" to value))?.status)
    }
  }

  @Test
  fun `docToDesktopState with an unknown status reads as missing`() {
    assertNull(docToDesktopState(mapOf("status" to "paused", "heartbeatAt" to now)))
    assertNull(docToDesktopState(emptyMap()))
  }

  @Test
  fun `docToDesktopState falls back for unexpected values`() {
    val state = docToDesktopState(mapOf("status" to "idle", "currentTaskName" to 1, "startedAt" to "x"))!!
    assertNull(state.currentTaskName)
    assertNull(state.startedAt)
    assertNull(state.heartbeatAt)
    assertEquals("", state.device)
  }
}
