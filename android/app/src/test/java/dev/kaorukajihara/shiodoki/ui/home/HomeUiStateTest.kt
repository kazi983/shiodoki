package dev.kaorukajihara.shiodoki.ui.home

import dev.kaorukajihara.shiodoki.data.SyncStatus
import dev.kaorukajihara.shiodoki.data.TasksSnapshot
import dev.kaorukajihara.shiodoki.model.Priority
import dev.kaorukajihara.shiodoki.task
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class HomeUiStateTest {
  @Test
  fun `not loaded yet`() {
    val state = toHomeUiState(null)
    assertNull(state.groups)
    assertNull(state.syncStatus)
  }

  @Test
  fun `groups incomplete, not deleted tasks by priority in order`() {
    val snapshot = TasksSnapshot(
      listOf(
        task("someday", priority = Priority.SOMEDAY),
        task("done", completed = true),
        task("deleted", deleted = true),
        task("now-new", createdAt = "2026-01-02T00:00:00Z"),
        task("now-old", createdAt = "2026-01-01T00:00:00Z"),
      ),
      SyncStatus.PENDING,
    )
    val state = toHomeUiState(snapshot)
    // SOONER and ANYTIME have no tasks, so they have no group.
    assertEquals(
      listOf(Priority.NOW to listOf("now-old", "now-new"), Priority.SOMEDAY to listOf("someday")),
      state.groups?.map { g -> g.priority to g.tasks.map { it.id } },
    )
    assertEquals(SyncStatus.PENDING, state.syncStatus)
  }
}
