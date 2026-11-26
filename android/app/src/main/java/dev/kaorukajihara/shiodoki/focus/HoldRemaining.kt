package dev.kaorukajihara.shiodoki.focus

import java.time.Duration
import java.time.Instant

/**
 * The time left of a hold as shown to the user (design §6.9): rounded up to half hours, so a
 * fresh 48-hour hold reads "48 時間" rather than "47 時間 30 分".
 */
data class HoldRemaining(val hours: Int, val minutes: Int) {
  /** Half an hour or less: shown as "30 分以内" instead of "30 分". */
  val withinHalfHour: Boolean get() = hours == 0
}

/** null once the hold has ended. [config] gives the length of an hour (shorter in test mode). */
fun holdRemaining(until: Instant, now: Instant, config: FocusConfig): HoldRemaining? {
  val left = Duration.between(now, until).toMillis()
  if (left <= 0) return null
  val halfHours = ((left + config.holdHalfHourMs - 1) / config.holdHalfHourMs).toInt()
  return HoldRemaining(hours = halfHours / 2, minutes = halfHours % 2 * 30)
}
