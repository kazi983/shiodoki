package dev.kaorukajihara.shiodoki.ui.home

import dev.kaorukajihara.shiodoki.model.DesktopState
import dev.kaorukajihara.shiodoki.model.DesktopStatus
import java.time.Instant
import org.junit.Assert.assertEquals
import org.junit.Test

class PcStatusTest {
  private val now = Instant.parse("2026-10-07T05:00:00Z")

  private fun state(
    status: DesktopStatus,
    heartbeatAt: Instant? = now.minusSeconds(60),
    startedAt: Instant? = null,
    nextPromptAt: Instant? = null,
    taskName: String? = null,
  ) = DesktopState(
    status = status,
    currentTaskId = taskName?.let { "t1" },
    currentTaskName = taskName,
    startedAt = startedAt,
    nextPromptAt = nextPromptAt,
    heartbeatAt = heartbeatAt,
    device = "pc",
  )

  @Test
  fun `no document`() {
    assertEquals(PcStatus.NoData, toPcStatus(null, now))
  }

  @Test
  fun `stopped wins over an old heartbeat`() {
    val old = now.minusSeconds(3 * 3600)
    assertEquals(
      PcStatus.Stopped(old, null),
      toPcStatus(state(DesktopStatus.STOPPED, heartbeatAt = old), now),
    )
  }

  @Test
  fun `stopped during a session keeps the interrupted task`() {
    assertEquals(
      PcStatus.Stopped(now, "資料作成"),
      toPcStatus(state(DesktopStatus.STOPPED, heartbeatAt = now, taskName = "資料作成"), now),
    )
  }

  @Test
  fun `offline only after more than 10 minutes without a heartbeat`() {
    val tenMinutes = now.minusSeconds(600)
    assertEquals(PcStatus.Choosing, toPcStatus(state(DesktopStatus.IDLE, heartbeatAt = tenMinutes), now))

    val older = tenMinutes.minusSeconds(1)
    assertEquals(
      PcStatus.Offline(older),
      toPcStatus(state(DesktopStatus.RUNNING, heartbeatAt = older, taskName = "a"), now),
    )
  }

  @Test
  fun `missing heartbeat is offline`() {
    assertEquals(PcStatus.Offline(null), toPcStatus(state(DesktopStatus.IDLE, heartbeatAt = null), now))
  }

  @Test
  fun `running shows elapsed and remaining minutes`() {
    val startedAt = now.minusSeconds(12 * 60 + 30)
    val status = toPcStatus(
      state(
        DesktopStatus.RUNNING,
        startedAt = startedAt,
        nextPromptAt = startedAt.plusSeconds(30 * 60),
        taskName = "資料作成",
      ),
      now,
    )
    // 12.5 minutes in: 12 elapsed (rounded down), 17.5 left (rounded up to 18).
    assertEquals(PcStatus.Running("資料作成", startedAt, 12, 18, 30), status)
  }

  @Test
  fun `running clamps a PC clock that is ahead or a session that is overdue`() {
    val startedAt = now.plusSeconds(90)
    val status = toPcStatus(
      state(DesktopStatus.RUNNING, startedAt = startedAt, nextPromptAt = now.minusSeconds(5), taskName = "a"),
      now,
    )
    assertEquals(PcStatus.Running("a", startedAt, 0, 0, 0), status)
  }

  @Test
  fun `running without times`() {
    assertEquals(
      PcStatus.Running("", null, null, null, null),
      toPcStatus(state(DesktopStatus.RUNNING), now),
    )
  }

  @Test
  fun `other statuses`() {
    val next = now.plusSeconds(300)
    assertEquals(PcStatus.Snoozed(next), toPcStatus(state(DesktopStatus.SNOOZED, nextPromptAt = next), now))
    assertEquals(PcStatus.Choosing, toPcStatus(state(DesktopStatus.IDLE), now))
    assertEquals(PcStatus.LeaveBlocked, toPcStatus(state(DesktopStatus.LEAVE_BLOCKED), now))
  }
}
