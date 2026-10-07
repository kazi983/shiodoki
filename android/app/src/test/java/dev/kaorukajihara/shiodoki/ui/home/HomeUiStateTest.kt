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
    assertNull(state.tasks)
    assertNull(state.syncStatus)
  }

  @Test
  fun `shows incomplete, not deleted tasks in order`() {
    val snapshot = TasksSnapshot(
      listOf(
        task("someday", priority = Priority.SOMEDAY),
        task("done", completed = true),
        task("deleted", deleted = true),
        task("now"),
      ),
      SyncStatus.PENDING,
    )
    val state = toHomeUiState(snapshot)
    assertEquals(listOf("now", "someday"), state.tasks?.map { it.id })
    assertEquals(SyncStatus.PENDING, state.syncStatus)
  }
}
