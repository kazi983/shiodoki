package dev.kaorukajihara.shiodoki.focus

import dev.kaorukajihara.shiodoki.model.EndReason
import dev.kaorukajihara.shiodoki.model.FinishedSession
import java.time.Instant
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.yield
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

private val T0: Instant = Instant.parse("2026-10-09T05:00:00Z")
private const val MINUTE = 60_000L

/** Keeps one saved session in memory; every call suspends once, like a real DataStore write. */
private class FakeFocusStore : FocusStore {
  var saved: SavedSession? = null
  var lastSelectedTaskId: String? = null
  var failNextSave = false

  override suspend fun loadRunning(): SavedSession? {
    yield()
    return saved
  }

  override suspend fun saveRunning(session: SavedSession) {
    yield()
    if (failNextSave) {
      failNextSave = false
      error("disk full")
    }
    saved = session
  }

  override suspend fun updateLastSeen(at: Instant) {
    yield()
    saved = saved?.copy(lastSeenAt = at)
  }

  override suspend fun clearRunning() {
    yield()
    saved = null
  }

  override suspend fun saveLastSelectedTaskId(taskId: String) {
    yield()
    lastSelectedTaskId = taskId
  }

  var hold: SavedHold? = null

  override suspend fun loadHold(): SavedHold? {
    yield()
    return hold
  }

  override suspend fun saveHold(hold: SavedHold) {
    yield()
    this.hold = hold
  }

  override suspend fun clearHold() {
    yield()
    hold = null
  }
}

private class FakeScreen : FocusScreen {
  var shown = 0
  var dismissed = 0

  override fun show() {
    shown++
  }

  override fun dismiss() {
    dismissed++
  }
}

@OptIn(ExperimentalCoroutinesApi::class)
private class Harness(private val test: TestScope, config: FocusConfig = FocusConfig.DEFAULT) {
  val store = FakeFocusStore()
  val screen = FakeScreen()
  val recorded = mutableListOf<FinishedSession>()

  /** What the store held at the moment each session was recorded. */
  val savedAtRecord = mutableListOf<SavedSession?>()
  val storeErrors = mutableListOf<Throwable>()
  var canPrompt = true
  private var ids = 0

  val controller = FocusController(
    scope = test.backgroundScope,
    store = store,
    recorder = { savedAtRecord += store.saved; recorded += it },
    screen = screen,
    canPrompt = { canPrompt },
    config = config,
    now = { T0.plusMillis(test.testScheduler.currentTime) },
    newId = { "s${++ids}" },
    onStoreError = { storeErrors += it },
  )

  val state get() = controller.state.value

  /** Unlock and pick a task, then let the store queue run. */
  fun start(taskId: String = "t1", taskName: String = "英単語") {
    controller.onUnlock()
    controller.onTaskSelected(taskId, taskName)
    test.runCurrent()
  }

  fun advance(ms: Long) {
    test.advanceTimeBy(ms)
    test.runCurrent()
  }
}

@OptIn(ExperimentalCoroutinesApi::class)
class FocusControllerTest {
  // --- unlock ---

  @Test
  fun `unlock while idle shows the focus screen`() = runTest {
    val h = Harness(this)
    h.controller.onUnlock()
    assertEquals(FocusState.Prompting, h.state)
    assertEquals(1, h.screen.shown)
  }

  @Test
  fun `unlock does nothing when prompting is not allowed`() = runTest {
    val h = Harness(this)
    h.canPrompt = false
    h.controller.onUnlock()
    assertEquals(FocusState.Idle, h.state)
    assertEquals(0, h.screen.shown)
  }

  @Test
  fun `unlock does nothing unless idle`() = runTest {
    val h = Harness(this)
    h.controller.onUnlock()
    h.controller.onUnlock()
    assertEquals(1, h.screen.shown)

    h.controller.onTaskSelected("t1", "英単語")
    h.controller.onUnlock()
    assertEquals(1, h.screen.shown)
    assertTrue(h.state is FocusState.Running)
  }

  // --- select / leave ---

  @Test
  fun `selecting a task starts a session and saves it on the device`() = runTest {
    val h = Harness(this)
    h.start("t1", "英単語")

    assertEquals(FocusState.Running("s1", "t1", "英単語", T0), h.state)
    assertEquals(SavedSession("s1", "t1", "英単語", startedAt = T0, lastSeenAt = T0), h.store.saved)
    assertEquals("t1", h.store.lastSelectedTaskId)
  }

  @Test
  fun `selecting a task is ignored unless the screen is showing`() = runTest {
    val h = Harness(this)
    h.controller.onTaskSelected("t1", "英単語")
    runCurrent()
    assertEquals(FocusState.Idle, h.state)
    assertNull(h.store.saved)
  }

  @Test
  fun `leaving the screen shows it again after a minute without recording`() = runTest {
    val h = Harness(this)
    h.controller.onUnlock()
    h.controller.onLeave()
    assertEquals(FocusState.Away, h.state)

    h.advance(MINUTE - 1)
    assertEquals(1, h.screen.shown)

    h.advance(1)
    assertEquals(FocusState.Prompting, h.state)
    assertEquals(2, h.screen.shown)
    assertTrue(h.recorded.isEmpty())
  }

  @Test
  fun `leaving again and again keeps bringing the screen back`() = runTest {
    val h = Harness(this)
    h.controller.onUnlock()
    repeat(3) {
      h.controller.onLeave()
      h.advance(MINUTE)
    }
    assertEquals(FocusState.Prompting, h.state)
    assertEquals(4, h.screen.shown)
  }

  @Test
  fun `a task can be picked from the screen shown again`() = runTest {
    val h = Harness(this)
    h.controller.onUnlock()
    h.controller.onLeave()
    h.advance(MINUTE)
    h.controller.onTaskSelected("t1", "英単語")
    runCurrent()
    assertEquals(FocusState.Running("s1", "t1", "英単語", T0.plusMillis(MINUTE)), h.state)
  }

  @Test
  fun `after leaving in a call the screen waits for the next unlock`() = runTest {
    val h = Harness(this)
    h.controller.onUnlock()
    h.controller.onLeave()
    h.canPrompt = false
    h.advance(MINUTE)
    assertEquals(FocusState.Idle, h.state)
    assertEquals(1, h.screen.shown)

    h.canPrompt = true
    h.controller.onUnlock()
    assertEquals(2, h.screen.shown)
  }

  @Test
  fun `screen off while away cancels the wait`() = runTest {
    val h = Harness(this)
    h.controller.onUnlock()
    h.controller.onLeave()
    h.controller.onScreenOff()
    assertEquals(FocusState.Idle, h.state)

    h.advance(MINUTE)
    assertEquals(FocusState.Idle, h.state)
    assertEquals(1, h.screen.shown)

    // The next unlock shows it again.
    h.controller.onUnlock()
    assertEquals(2, h.screen.shown)
  }

  @Test
  fun `stop while away cancels the wait`() = runTest {
    val h = Harness(this)
    h.controller.onUnlock()
    h.controller.onLeave()
    h.controller.stop()
    h.advance(MINUTE)
    assertEquals(FocusState.Idle, h.state)
    assertEquals(1, h.screen.shown)
  }

  @Test
  fun `unlock while away does nothing`() = runTest {
    val h = Harness(this)
    h.controller.onUnlock()
    h.controller.onLeave()
    h.controller.onUnlock()
    assertEquals(FocusState.Away, h.state)
    assertEquals(1, h.screen.shown)
  }

  @Test
  fun `leaving is ignored unless the screen is showing`() = runTest {
    val h = Harness(this)
    h.controller.onLeave()
    assertEquals(FocusState.Idle, h.state)

    h.start()
    h.controller.onLeave()
    assertTrue(h.state is FocusState.Running)
  }

  // --- screen off ---

  @Test
  fun `screen off while prompting closes the screen`() = runTest {
    val h = Harness(this)
    h.controller.onUnlock()
    h.controller.onScreenOff()
    assertEquals(FocusState.Idle, h.state)
    assertEquals(1, h.screen.dismissed)

    // The next unlock shows it again.
    h.controller.onUnlock()
    assertEquals(2, h.screen.shown)
  }

  @Test
  fun `screen off while running records screen_off with whole minutes`() = runTest {
    val h = Harness(this)
    h.start("t1", "英単語")
    h.advance(2 * MINUTE + 30_000)
    h.controller.onScreenOff()
    runCurrent()

    assertEquals(FocusState.Idle, h.state)
    val s = h.recorded.single()
    assertEquals(
      FinishedSession("s1", "t1", "英単語", T0, T0.plusMillis(2 * MINUTE + 30_000), EndReason.SCREEN_OFF),
      s,
    )
    assertEquals(2L, s.elapsedMinutes)
    assertNull(h.store.saved)
  }

  @Test
  fun `the saved session is cleared before the session is recorded`() = runTest {
    val h = Harness(this)
    h.start()
    h.advance(5 * MINUTE)
    h.controller.onScreenOff()
    runCurrent()
    assertEquals(listOf<SavedSession?>(null), h.savedAtRecord)
  }

  @Test
  fun `sessions shorter than a minute are not recorded but are cleared`() = runTest {
    val h = Harness(this)
    h.start()
    h.advance(MINUTE - 1)
    h.controller.onScreenOff()
    runCurrent()

    assertTrue(h.recorded.isEmpty())
    assertNull(h.store.saved)
  }

  @Test
  fun `exactly one minute is recorded`() = runTest {
    val h = Harness(this)
    h.start()
    h.advance(MINUTE)
    h.controller.onScreenOff()
    runCurrent()
    assertEquals(1L, h.recorded.single().elapsedMinutes)
  }

  // --- interval ---

  @Test
  fun `after 30 minutes the session is recorded as interval and the screen is shown again`() = runTest {
    val h = Harness(this)
    h.start()
    h.advance(30 * MINUTE)

    val s = h.recorded.single()
    assertEquals(EndReason.INTERVAL, s.endReason)
    assertEquals(30L, s.elapsedMinutes)
    assertEquals(FocusState.Prompting, h.state)
    assertEquals(2, h.screen.shown)
    assertNull(h.store.saved)
  }

  @Test
  fun `a new session after the interval gets a new id`() = runTest {
    val h = Harness(this)
    h.start()
    h.advance(30 * MINUTE)
    h.controller.onTaskSelected("t2", "読書")
    runCurrent()

    assertEquals("s2", (h.state as FocusState.Running).sessionId)
    assertEquals("s2", h.store.saved?.sessionId)
  }

  @Test
  fun `after 30 minutes in a call the session is recorded but the screen stays closed`() = runTest {
    val h = Harness(this)
    h.start()
    h.canPrompt = false
    h.advance(30 * MINUTE)

    assertEquals(EndReason.INTERVAL, h.recorded.single().endReason)
    assertEquals(FocusState.Idle, h.state)
    assertEquals(1, h.screen.shown)
  }

  @Test
  fun `a session ended by screen off is never finished again by the timer`() = runTest {
    val h = Harness(this)
    h.start()
    h.advance(10 * MINUTE)
    h.controller.onScreenOff()
    h.controller.onScreenOff()
    h.controller.stop()
    h.advance(60 * MINUTE)

    assertEquals(listOf(EndReason.SCREEN_OFF), h.recorded.map { it.endReason })
    assertEquals(1, h.screen.shown)
  }

  // --- lastSeenAt ---

  @Test
  fun `lastSeenAt is saved every minute while running`() = runTest {
    val h = Harness(this)
    h.start()
    h.advance(3 * MINUTE + 30_000)
    assertEquals(T0.plusMillis(3 * MINUTE), h.store.saved?.lastSeenAt)
  }

  // --- stop (sign-out / feature off) ---

  @Test
  fun `stop while running records app_exit`() = runTest {
    val h = Harness(this)
    h.start()
    h.advance(5 * MINUTE)
    h.controller.stop()
    runCurrent()

    assertEquals(EndReason.APP_EXIT, h.recorded.single().endReason)
    assertEquals(FocusState.Idle, h.state)
    assertNull(h.store.saved)
  }

  @Test
  fun `flush waits until the last session is recorded`() = runTest {
    val h = Harness(this)
    h.start()
    h.advance(5 * MINUTE)
    h.controller.stop()
    assertTrue(h.recorded.isEmpty())

    h.controller.flush()
    assertEquals(EndReason.APP_EXIT, h.recorded.single().endReason)
  }

  @Test
  fun `stop while prompting closes the screen`() = runTest {
    val h = Harness(this)
    h.controller.onUnlock()
    h.controller.stop()
    assertEquals(FocusState.Idle, h.state)
    assertEquals(1, h.screen.dismissed)
  }

  // --- recovery (M-17) ---

  @Test
  fun `recover records a session of a killed process as app_exit up to lastSeenAt`() = runTest {
    val h = Harness(this)
    val lastSeen = T0.plusMillis(12 * MINUTE)
    h.store.saved = SavedSession("old", "t1", "英単語", startedAt = T0, lastSeenAt = lastSeen)
    h.controller.recover()
    runCurrent()

    assertEquals(
      listOf(FinishedSession("old", "t1", "英単語", T0, lastSeen, EndReason.APP_EXIT)),
      h.recorded,
    )
    assertEquals(listOf<SavedSession?>(null), h.savedAtRecord)
  }

  @Test
  fun `recover is a no-op the second time`() = runTest {
    val h = Harness(this)
    h.store.saved = SavedSession("old", "t1", "英単語", startedAt = T0, lastSeenAt = T0.plusMillis(5 * MINUTE))
    h.controller.recover()
    h.controller.recover()
    runCurrent()
    assertEquals(1, h.recorded.size)
  }

  @Test
  fun `recover drops a saved session shorter than a minute`() = runTest {
    val h = Harness(this)
    h.store.saved = SavedSession("old", "t1", "英単語", startedAt = T0, lastSeenAt = T0.plusMillis(30_000))
    h.controller.recover()
    runCurrent()

    assertTrue(h.recorded.isEmpty())
    assertNull(h.store.saved)
  }

  @Test
  fun `recover leaves the session of this process alone`() = runTest {
    val h = Harness(this)
    h.start()
    h.advance(5 * MINUTE)
    h.controller.recover()
    runCurrent()

    assertTrue(h.recorded.isEmpty())
    assertEquals("s1", h.store.saved?.sessionId)
  }

  @Test
  fun `a session started right after recover is not recovered`() = runTest {
    val h = Harness(this)
    h.controller.recover()
    h.start()

    assertTrue(h.recorded.isEmpty())
    assertEquals("s1", h.store.saved?.sessionId)
  }

  // --- config and errors ---

  @Test
  fun `test mode uses 30 seconds and a 5 second minimum`() = runTest {
    val h = Harness(this, FocusConfig.TEST)
    h.start()
    h.advance(30_000)
    assertEquals(EndReason.INTERVAL, h.recorded.single().endReason)

    h.controller.onTaskSelected("t1", "英単語")
    h.advance(4_999)
    h.controller.onScreenOff()
    runCurrent()
    assertEquals(1, h.recorded.size)
  }

  @Test
  fun `test mode shows the screen again 10 seconds after leaving`() = runTest {
    val h = Harness(this, FocusConfig.TEST)
    h.controller.onUnlock()
    h.controller.onLeave()
    h.advance(9_999)
    assertEquals(FocusState.Away, h.state)
    h.advance(1)
    assertEquals(FocusState.Prompting, h.state)
  }

  @Test
  fun `a failed store write is reported and later writes still run`() = runTest {
    val h = Harness(this)
    h.store.failNextSave = true
    h.start()
    assertEquals("disk full", h.storeErrors.single().message)

    h.advance(2 * MINUTE)
    h.controller.onScreenOff()
    runCurrent()
    assertEquals(1, h.recorded.size)
  }

  // --- hold (M-20, design §6.9) ---

  private fun Harness.hold(halfHours: Int = 6, reason: String = "イベント中") {
    controller.onUnlock()
    controller.onHold(halfHours, reason)
    advance(0)
  }

  @Test
  fun `hold closes the screen and saves until when and why`() = runTest {
    val h = Harness(this)
    h.hold(halfHours = 6, reason = "  イベント中 ")
    val until = T0.plusMillis(3 * 60 * MINUTE)
    assertEquals(FocusState.OnHold(until, "イベント中"), h.state)
    assertEquals(SavedHold(until, "イベント中"), h.store.hold)
    assertTrue(h.recorded.isEmpty())
  }

  @Test
  fun `hold needs a reason of 3 characters and a duration of 30 minutes to 72 hours`() = runTest {
    val h = Harness(this)
    h.controller.onUnlock()
    h.controller.onHold(2, " ab ")
    h.controller.onHold(0, "イベント")
    h.controller.onHold(MAX_HOLD_HALF_HOURS + 1, "イベント")
    assertEquals(FocusState.Prompting, h.state)
    h.controller.onHold(MAX_HOLD_HALF_HOURS, "旅行中")
    assertTrue(h.state is FocusState.OnHold)
  }

  @Test
  fun `hold only from the focus screen`() = runTest {
    val h = Harness(this)
    h.controller.onHold(2, "イベント")
    assertEquals(FocusState.Idle, h.state)
  }

  @Test
  fun `unlocks during a hold do not show the screen`() = runTest {
    val h = Harness(this)
    h.hold(halfHours = 2)
    h.controller.onScreenOff()
    h.advance(59 * MINUTE)
    h.controller.onUnlock()
    assertTrue(h.state is FocusState.OnHold)
    assertEquals(1, h.screen.shown)
  }

  @Test
  fun `the first unlock after the hold shows the screen`() = runTest {
    val h = Harness(this)
    h.hold(halfHours = 2)
    h.advance(60 * MINUTE)
    h.controller.onUnlock()
    runCurrent()
    assertEquals(FocusState.Prompting, h.state)
    assertEquals(2, h.screen.shown)
    assertNull(h.store.hold)
  }

  @Test
  fun `a hold that ends while the screen is on waits for the next unlock`() = runTest {
    val h = Harness(this)
    h.hold(halfHours = 1)
    h.advance(29 * MINUTE)
    assertEquals(false, h.controller.expireHoldIfDue())
    h.advance(MINUTE)
    assertEquals(true, h.controller.expireHoldIfDue())
    runCurrent()
    assertEquals(FocusState.Idle, h.state)
    assertEquals(1, h.screen.shown)
    assertNull(h.store.hold)
  }

  @Test
  fun `end hold early`() = runTest {
    val h = Harness(this)
    h.hold()
    h.controller.endHold()
    runCurrent()
    assertEquals(FocusState.Idle, h.state)
    assertNull(h.store.hold)
    h.controller.onUnlock()
    assertEquals(FocusState.Prompting, h.state)
  }

  @Test
  fun `sign-out or turning the feature off ends a hold`() = runTest {
    val h = Harness(this)
    h.hold()
    h.controller.stop()
    runCurrent()
    assertEquals(FocusState.Idle, h.state)
    assertNull(h.store.hold)
  }

  @Test
  fun `a saved hold comes back on service start`() = runTest {
    val h = Harness(this)
    val until = T0.plusMillis(48 * 60 * MINUTE)
    h.store.hold = SavedHold(until, "旅行中")
    h.controller.recover()
    runCurrent()
    assertEquals(FocusState.OnHold(until, "旅行中"), h.state)
    h.controller.onUnlock()
    assertEquals(0, h.screen.shown)
  }

  @Test
  fun `a saved hold that has ended is dropped on service start`() = runTest {
    val h = Harness(this)
    h.store.hold = SavedHold(T0, "旅行中")
    h.controller.recover()
    runCurrent()
    assertEquals(FocusState.Idle, h.state)
    assertNull(h.store.hold)
  }

  @Test
  fun `test mode makes an hour of hold a minute`() = runTest {
    val h = Harness(this, FocusConfig.TEST)
    h.hold(halfHours = 96)
    assertEquals(FocusState.OnHold(T0.plusMillis(48 * MINUTE), "イベント中"), h.state)
  }
}
