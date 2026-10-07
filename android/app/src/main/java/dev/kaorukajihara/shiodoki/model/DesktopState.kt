package dev.kaorukajihara.shiodoki.model

import java.time.Instant

/** `state/desktop.status`, written by the desktop app (requirements §5.1). */
enum class DesktopStatus(val value: String) {
  /** The task picker is open. */
  IDLE("idle"),
  RUNNING("running"),
  SNOOZED("snoozed"),
  /** Work is blocked before the leave time. */
  LEAVE_BLOCKED("leave_blocked"),
  /** The desktop app has quit. */
  STOPPED("stopped");

  companion object {
    fun fromValue(value: Any?): DesktopStatus? = entries.firstOrNull { it.value == value }
  }
}

/** The PC's current status (`users/{uid}/state/desktop`, requirements D-02 / M-05). */
data class DesktopState(
  val status: DesktopStatus,
  val currentTaskId: String?,
  val currentTaskName: String?,
  val startedAt: Instant?,
  /** When the desktop shows the task picker next (end of the session or of the snooze). */
  val nextPromptAt: Instant?,
  /** Re-sent every 5 minutes while the desktop app runs; null only for malformed documents. */
  val heartbeatAt: Instant?,
  val device: String,
)
