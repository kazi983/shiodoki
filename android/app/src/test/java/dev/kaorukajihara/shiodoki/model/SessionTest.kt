package dev.kaorukajihara.shiodoki.model

import java.time.Instant
import org.junit.Assert.assertEquals
import org.junit.Test

class SessionTest {
  private val start = Instant.parse("2026-10-09T05:00:00Z")

  @Test
  fun `elapsed minutes round down`() {
    assertEquals(0L, elapsedMinutes(start, start.plusSeconds(59)))
    assertEquals(1L, elapsedMinutes(start, start.plusSeconds(60)))
    assertEquals(29L, elapsedMinutes(start, start.plusSeconds(30 * 60 - 1)))
  }

  @Test
  fun `elapsed minutes are never negative`() {
    assertEquals(0L, elapsedMinutes(start, start.minusSeconds(120)))
  }

  @Test
  fun `end reasons use the Firestore values`() {
    assertEquals(listOf("screen_off", "interval", "app_exit"), EndReason.entries.map { it.value })
  }
}
