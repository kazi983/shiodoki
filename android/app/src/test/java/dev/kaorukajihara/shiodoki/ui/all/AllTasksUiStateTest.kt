package dev.kaorukajihara.shiodoki.ui.all

import dev.kaorukajihara.shiodoki.data.SyncStatus
import dev.kaorukajihara.shiodoki.data.TasksSnapshot
import dev.kaorukajihara.shiodoki.model.Priority
import dev.kaorukajihara.shiodoki.task
import java.time.Instant
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class AllTasksUiStateTest {
  private val now = Instant.parse("2026-10-20T12:00:00Z")

  @Test
  fun `not loaded yet`() {
    val state = toAllTasksUiState(null, TaskFilter.OPEN, now)
    assertNull(state.open)
    assertNull(state.completed)
  }

  @Test
  fun `completed view has the last 30 days, newest first`() {
    val snapshot = TasksSnapshot(
      listOf(
        task("open"),
        task("old", completed = true, completedAt = "2026-09-20T11:59:59Z"),
        task("edge", completed = true, completedAt = "2026-09-20T12:00:00Z"),
        task("recent", completed = true, completedAt = "2026-10-19T00:00:00Z"),
        task("deleted", completed = true, completedAt = "2026-10-19T00:00:00Z", deleted = true),
        task("no-date", completed = true),
      ),
      SyncStatus.SYNCED,
    )
    val state = toAllTasksUiState(snapshot, TaskFilter.COMPLETED, now)
    assertEquals(
      listOf(Priority.NOW to listOf("recent", "edge")),
      state.completed?.map { g -> g.priority to g.tasks.map { it.id } },
    )
    assertEquals(listOf("open"), state.open?.flatMap { g -> g.tasks.map { it.id } })
    assertEquals(TaskFilter.COMPLETED, state.filter)
  }

  @Test
  fun `completed view groups by priority in the fixed order, each newest first`() {
    val snapshot = TasksSnapshot(
      listOf(
        task("break", priority = Priority.BREAK, completed = true, completedAt = "2026-10-19T00:00:00Z"),
        task("now-old", completed = true, completedAt = "2026-10-10T00:00:00Z"),
        task("now-new", completed = true, completedAt = "2026-10-18T00:00:00Z"),
        // A position does not change the completed order.
        task("now-mid", completed = true, completedAt = "2026-10-15T00:00:00Z", sortOrder = 0.0),
      ),
      SyncStatus.SYNCED,
    )
    val state = toAllTasksUiState(snapshot, TaskFilter.COMPLETED, now)
    assertEquals(
      listOf(Priority.NOW to listOf("now-new", "now-mid", "now-old"), Priority.BREAK to listOf("break")),
      state.completed?.map { g -> g.priority to g.tasks.map { it.id } },
    )
  }
}
