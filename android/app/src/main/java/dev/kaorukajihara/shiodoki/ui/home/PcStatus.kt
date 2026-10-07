package dev.kaorukajihara.shiodoki.ui.home

import dev.kaorukajihara.shiodoki.model.DesktopState
import dev.kaorukajihara.shiodoki.model.DesktopStatus
import java.time.Duration
import java.time.Instant

/**
 * Two desktop heartbeats (5 minutes each, `HEARTBEAT_MS`): an older `heartbeatAt` means the PC is
 * offline (design §5.3, Q-A5).
 */
val PC_OFFLINE_AFTER: Duration = Duration.ofMinutes(10)

/** What the PC status card shows (design §5.3). */
sealed interface PcStatus {
  /** No `state/desktop` yet: the desktop app has never signed in with this account. */
  data object NoData : PcStatus

  data class Stopped(val stoppedAt: Instant?) : PcStatus

  /** No heartbeat for [PC_OFFLINE_AFTER]: the PC sleeps, lost its network or the app crashed. */
  data class Offline(val lastSeen: Instant?) : PcStatus

  data class Running(
    val taskName: String,
    val startedAt: Instant?,
    val elapsedMinutes: Long?,
    /** Minutes until the next task picker, rounded up; null when the desktop did not send it. */
    val remainingMinutes: Long?,
    /** Length of the session, for the progress ring. */
    val totalMinutes: Long?,
  ) : PcStatus

  data class Snoozed(val nextPromptAt: Instant?) : PcStatus

  /** The task picker is open on the PC. */
  data object Choosing : PcStatus

  data object LeaveBlocked : PcStatus
}

/**
 * Decides the card from `state/desktop` in the order of the design §5.3 table. [now] is the
 * device time, so the result changes as time passes even when the document does not.
 */
fun toPcStatus(state: DesktopState?, now: Instant): PcStatus {
  if (state == null) return PcStatus.NoData
  if (state.status == DesktopStatus.STOPPED) return PcStatus.Stopped(state.heartbeatAt)
  val heartbeat = state.heartbeatAt
  if (heartbeat == null || Duration.between(heartbeat, now) > PC_OFFLINE_AFTER) {
    return PcStatus.Offline(heartbeat)
  }
  return when (state.status) {
    DesktopStatus.RUNNING -> PcStatus.Running(
      taskName = state.currentTaskName ?: "",
      startedAt = state.startedAt,
      elapsedMinutes = state.startedAt?.let { wholeMinutes(it, now) },
      remainingMinutes = state.nextPromptAt?.let { ceilMinutes(now, it) },
      totalMinutes = state.startedAt?.let { start -> state.nextPromptAt?.let { ceilMinutes(start, it) } },
    )
    DesktopStatus.SNOOZED -> PcStatus.Snoozed(state.nextPromptAt)
    DesktopStatus.IDLE -> PcStatus.Choosing
    DesktopStatus.LEAVE_BLOCKED -> PcStatus.LeaveBlocked
    DesktopStatus.STOPPED -> PcStatus.Stopped(state.heartbeatAt)
  }
}

/** Whole minutes from [from] to [to], never negative (clocks of the PC and phone may differ). */
private fun wholeMinutes(from: Instant, to: Instant): Long =
  Duration.between(from, to).toMinutes().coerceAtLeast(0)

/** Minutes from [from] to [to] rounded up, so "1 minute left" lasts until the end. */
private fun ceilMinutes(from: Instant, to: Instant): Long {
  val seconds = Duration.between(from, to).seconds
  return if (seconds <= 0) 0 else (seconds + 59) / 60
}
