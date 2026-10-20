package dev.kaorukajihara.shiodoki.ui.all

import dev.kaorukajihara.shiodoki.data.SyncStatus
import dev.kaorukajihara.shiodoki.data.TasksSnapshot
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
    assertEquals(listOf("recent", "edge"), state.completed?.map { it.id })
    assertEquals(listOf("open"), state.open?.flatMap { g -> g.tasks.map { it.id } })
    assertEquals(TaskFilter.COMPLETED, state.filter)
  }
}
