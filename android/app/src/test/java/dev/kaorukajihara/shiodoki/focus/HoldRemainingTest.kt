package dev.kaorukajihara.shiodoki.focus

import java.time.Instant
import java.time.ZoneId
import java.time.ZonedDateTime
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class HoldRemainingTest {
  private val now = Instant.parse("2026-11-25T03:00:00Z")
  private fun left(minutes: Long, seconds: Long = 0) =
    holdRemaining(now.plusSeconds(minutes * 60 + seconds), now, FocusConfig.DEFAULT)

  @Test
  fun `rounds up to half hours`() {
    assertEquals(HoldRemaining(48, 0), left(48 * 60))
    assertEquals(HoldRemaining(48, 0), left(47 * 60 + 41))
    assertEquals(HoldRemaining(47, 30), left(47 * 60 + 30))
    assertEquals(HoldRemaining(1, 0), left(30, 1))
  }

  @Test
  fun `half an hour or less is within half an hour`() {
    assertTrue(left(30)!!.withinHalfHour)
    assertTrue(left(0, 1)!!.withinHalfHour)
  }

  @Test
  fun `null once ended`() {
    assertNull(left(0))
    assertNull(left(-5))
  }

  @Test
  fun `test mode counts minutes as hours`() {
    assertEquals(HoldRemaining(47, 30), holdRemaining(now.plusSeconds(47 * 60 + 30), now, FocusConfig.TEST))
  }
}

class OffReminderTest {
  private val zone = ZoneId.of("Asia/Tokyo")
  private fun at(text: String) = ZonedDateTime.of(java.time.LocalDateTime.parse(text), zone)

  @Test
  fun `before 8 the same morning`() {
    assertEquals(at("2026-11-25T08:00"), nextOffReminderAt(at("2026-11-25T07:59:30"), testMode = false))
  }

  @Test
  fun `from 8 on the next morning`() {
    assertEquals(at("2026-11-26T08:00"), nextOffReminderAt(at("2026-11-25T08:00"), testMode = false))
    assertEquals(at("2026-11-26T08:00"), nextOffReminderAt(at("2026-11-25T23:10"), testMode = false))
  }

  @Test
  fun `test mode a minute later`() {
    assertEquals(at("2026-11-25T23:11"), nextOffReminderAt(at("2026-11-25T23:10"), testMode = true))
  }
}

class HoldReasonTest {
  @Test
  fun `three characters after trimming`() {
    assertEquals(false, isValidHoldReason("  ab  "))
    assertEquals(true, isValidHoldReason("旅行中"))
    assertEquals(false, isValidHoldReason("🙂🙂"))
    assertEquals(true, isValidHoldReason("🙂🙂🙂"))
  }
}
