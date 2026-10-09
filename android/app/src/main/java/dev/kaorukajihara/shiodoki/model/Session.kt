package dev.kaorukajihara.shiodoki.model

import java.time.Duration
import java.time.Instant

/** How a phone session ended; [value] is the `endReason` stored in Firestore (requirements §5.1). */
enum class EndReason(val value: String) {
  SCREEN_OFF("screen_off"),
  INTERVAL("interval"),
  APP_EXIT("app_exit"),
}

/** A session ready to be written as `sessions/{id}` (design §4.4). The device name is added when writing. */
data class FinishedSession(
  val id: String,
  val taskId: String,
  val taskName: String,
  val startedAt: Instant,
  val endedAt: Instant,
  val endReason: EndReason,
) {
  val elapsedMinutes: Long
    get() = elapsedMinutes(startedAt, endedAt)
}

/** Whole minutes between the two instants, rounded down and never negative (desktop `elapsedMinutes`). */
fun elapsedMinutes(startedAt: Instant, endedAt: Instant): Long =
  Duration.between(startedAt, endedAt).toMinutes().coerceAtLeast(0)
