package dev.kaorukajihara.shiodoki.ui.focus

import dev.kaorukajihara.shiodoki.data.SyncStatus
import dev.kaorukajihara.shiodoki.data.TasksSnapshot
import dev.kaorukajihara.shiodoki.model.DesktopState
import dev.kaorukajihara.shiodoki.model.DesktopStatus
import dev.kaorukajihara.shiodoki.task
import java.time.Instant
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class FocusUiStateTest {
  private val now = Instant.parse("2026-10-09T05:00:00Z")

  private fun desktop(
    status: DesktopStatus = DesktopStatus.RUNNING,
    heartbeatAt: Instant = now.minusSeconds(60),
    taskId: String? = "t1",
  ) = DesktopState(
    status = status,
    currentTaskId = taskId,
    currentTaskName = "資料作成",
    startedAt = now.minusSeconds(12 * 60),
    nextPromptAt = now.plusSeconds(18 * 60),
    heartbeatAt = heartbeatAt,
    device = "pc",
  )

  @Test
  fun `the PC task is offered while the PC runs it`() {
    assertEquals(PcTask("t1", "資料作成", 12), toPcTask(desktop(), now))
  }

  @Test
  fun `no PC task when the PC is offline, not running or the id is missing`() {
    assertNull(toPcTask(null, now))
    assertNull(toPcTask(desktop(heartbeatAt = now.minusSeconds(11 * 60)), now))
    assertNull(toPcTask(desktop(status = DesktopStatus.SNOOZED), now))
    assertNull(toPcTask(desktop(status = DesktopStatus.STOPPED), now))
    assertNull(toPcTask(desktop(taskId = null), now))
  }

  @Test
  fun `the previous phone choice is shown only while incomplete`() {
    val tasks = TasksSnapshot(
      listOf(task("a"), task("done", completed = true), task("gone", deleted = true)),
      SyncStatus.SYNCED,
    )
    assertEquals("a", toFocusUiState(tasks, null, "a", now).previous?.id)
    assertNull(toFocusUiState(tasks, null, "done", now).previous)
    assertNull(toFocusUiState(tasks, null, "gone", now).previous)
    assertNull(toFocusUiState(tasks, null, null, now).previous)
  }

  @Test
  fun `the list holds incomplete tasks only`() {
    val tasks = TasksSnapshot(listOf(task("a"), task("done", completed = true)), SyncStatus.SYNCED)
    assertEquals(listOf("a"), toFocusUiState(tasks, null, null, now).groups?.flatMap { g -> g.tasks.map { it.id } })
  }
}
