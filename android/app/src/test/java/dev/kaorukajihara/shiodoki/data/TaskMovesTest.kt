package dev.kaorukajihara.shiodoki.data

import dev.kaorukajihara.shiodoki.model.Priority
import dev.kaorukajihara.shiodoki.model.TaskDrop
import dev.kaorukajihara.shiodoki.model.TaskPatch
import dev.kaorukajihara.shiodoki.task
import java.time.Instant
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class TaskMovesTest {
  private val now = Instant.parse("2026-10-21T00:00:00Z")
  private val repo = FakeTaskRepository(
    listOf(
      task("a", sortOrder = 1000.0),
      task("b", sortOrder = 2000.0),
      task("s1", priority = Priority.SOONER, sortOrder = 1000.0),
      task("done", priority = Priority.SOONER, completed = true, sortOrder = 9000.0),
    ),
  )

  @Test
  fun `a drop into another priority returns what to tell and undo`() {
    val move = repo.moveTask(TaskDrop("b", Priority.SOONER, listOf("b", "s1")), now = now)
    assertEquals(TaskMove("b", from = Priority.NOW, to = Priority.SOONER, previousSortOrder = 2000.0), move)
    assertTrue(move!!.priorityChanged)
    assertEquals(listOf("b" to TaskPatch(priority = Priority.SOONER, sortOrder = 0.0)), repo.updates)

    repo.undoMove(move)
    assertEquals("b" to TaskPatch(priority = Priority.NOW, sortOrder = 2000.0), repo.updates.last())
  }

  @Test
  fun `a drop in the same priority only moves it`() {
    val move = repo.moveTask(TaskDrop("b", Priority.NOW, listOf("b", "a")), now = now)
    assertFalse(move!!.priorityChanged)
    repo.undoMove(move)
    assertEquals("b" to TaskPatch(sortOrder = 2000.0), repo.updates.last())
  }

  @Test
  fun `a drop that changes nothing writes nothing`() {
    assertNull(repo.moveTask(TaskDrop("a", Priority.NOW, listOf("a", "b")), now = now))
    assertNull(repo.moveTask(TaskDrop("missing", Priority.NOW, listOf("missing")), now = now))
    assertTrue(repo.updates.isEmpty())
  }

  @Test
  fun `on the completed list only the priority changes`() {
    assertNull(repo.moveTask(TaskDrop("done", Priority.SOONER, listOf("s1", "done")), keepPosition = false, now = now))
    val move = repo.moveTask(TaskDrop("done", Priority.NOW, listOf("done")), keepPosition = false, now = now)
    assertEquals(Priority.NOW, move?.to)
    // The repository puts it at the end of NOW (TaskPatch.withEndSortOrder).
    assertEquals(listOf("done" to TaskPatch(priority = Priority.NOW)), repo.updates)
  }
}
