package dev.kaorukajihara.shiodoki.focus

import dev.kaorukajihara.shiodoki.model.EndReason
import dev.kaorukajihara.shiodoki.model.FinishedSession
import java.time.Duration
import java.time.Instant
import java.util.UUID
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** Durations of the focus feature; [TEST] is the debug test mode (M-18, design §6.8). */
data class FocusConfig(
  /** A session is recorded as `interval` and the focus screen shown again after this long. */
  val intervalMs: Long,
  /** Shorter sessions are not recorded (M-13). */
  val minRecordMs: Long,
  /** How often `lastSeenAt` is saved while running (§6.6). */
  val lastSeenIntervalMs: Long,
  /** The focus screen is shown again this long after leaving it without a choice (M-14). */
  val repromptAfterLeaveMs: Long,
  /** One hour of a hold (M-20); the test mode makes it a minute (design §6.9). */
  val holdHourMs: Long,
) {
  /** The step of hold durations and of the remaining time shown. */
  val holdHalfHourMs: Long get() = holdHourMs / 2

  companion object {
    val DEFAULT = FocusConfig(
      intervalMs = 30 * 60_000L,
      minRecordMs = 60_000L,
      lastSeenIntervalMs = 60_000L,
      repromptAfterLeaveMs = 60_000L,
      holdHourMs = 3_600_000L,
    )
    val TEST = FocusConfig(
      intervalMs = 30_000L,
      minRecordMs = 5_000L,
      lastSeenIntervalMs = 5_000L,
      repromptAfterLeaveMs = 10_000L,
      holdHourMs = 60_000L,
    )
  }
}

sealed interface FocusState {
  /** Nothing to do: after a screen off, or when the screen was not shown (e.g. in a call). */
  data object Idle : FocusState

  /** The focus screen is showing. */
  data object Prompting : FocusState

  /** The screen was left without a choice; it is shown again after `repromptAfterLeaveMs`. */
  data object Away : FocusState

  /** A phone session is running and the interval timer is ticking. */
  data class Running(
    val sessionId: String,
    val taskId: String,
    val taskName: String,
    val startedAt: Instant,
  ) : FocusState

  /** The focus screen is held until [until] (M-20): unlocks do not show it. */
  data class OnHold(val until: Instant, val reason: String) : FocusState
}

/** A hold lasts from half an hour to 72 hours, in half-hour steps (M-20). */
const val MAX_HOLD_HALF_HOURS = 144

/** The reason must be typed every time; this many characters at least (M-20). */
const val MIN_HOLD_REASON_LENGTH = 3

fun isValidHoldReason(reason: String): Boolean {
  val trimmed = reason.trim()
  return trimmed.codePointCount(0, trimmed.length) >= MIN_HOLD_REASON_LENGTH
}

/**
 * State machine of the focus screen (design §6.2). Free of Android classes so it can be tested
 * on the JVM with virtual time, like the desktop `AppController`.
 *
 * Every path that ends a session goes through [finishSession], which records it at most once.
 * Call all methods on one thread, and give a [scope] that runs on that same thread (the main
 * thread in the app), so timer callbacks never race with events.
 *
 * Store writes are suspend functions (DataStore). They go through one queue and run one at a
 * time in call order, so "clear the saved session, then record" (§6.6) and "clear the old
 * session, then save the new one" cannot be reordered.
 */
class FocusController(
  private val scope: CoroutineScope,
  private val store: FocusStore,
  private val recorder: SessionRecorder,
  private val screen: FocusScreen,
  /** Signed in and not in a call or alarm (M-15). Checked before the screen is shown. */
  private val canPrompt: () -> Boolean,
  private val config: FocusConfig = FocusConfig.DEFAULT,
  private val now: () -> Instant = Instant::now,
  private val newId: () -> String = { UUID.randomUUID().toString() },
  private val onStoreError: (Throwable) -> Unit = {},
) {
  private val _state = MutableStateFlow<FocusState>(FocusState.Idle)
  val state: StateFlow<FocusState> = _state.asStateFlow()

  /** The interval timer and the lastSeenAt ticker of the running session. */
  private var timers: Job? = null

  /** The wait in [FocusState.Away]. */
  private var reprompt: Job? = null

  private val storeOps = Channel<suspend () -> Unit>(Channel.UNLIMITED)

  init {
    scope.launch {
      for (op in storeOps) {
        try {
          op()
        } catch (e: CancellationException) {
          throw e
        } catch (e: Exception) {
          // Keep the queue alive; one failed write must not stop later ones.
          onStoreError(e)
        }
      }
    }
  }

  fun onUnlock() {
    expireHoldIfDue()
    if (_state.value != FocusState.Idle || !canPrompt()) return
    prompt()
  }

  /**
   * "一時停止" on the focus screen (M-20, design §6.9): no screen until [halfHours] half hours
   * from now. Nothing is recorded. Ignored with an out-of-range duration or a too short reason.
   */
  fun onHold(halfHours: Int, reason: String) {
    if (_state.value != FocusState.Prompting) return
    if (halfHours !in 1..MAX_HOLD_HALF_HOURS || !isValidHoldReason(reason)) return
    val hold = FocusState.OnHold(now().plusMillis(halfHours * config.holdHalfHourMs), reason.trim())
    _state.value = hold
    enqueue { store.saveHold(SavedHold(hold.until, hold.reason)) }
  }

  /** "一時停止を終了" (notification or home card): the next unlock shows the screen again. */
  fun endHold() {
    if (_state.value !is FocusState.OnHold) return
    clearHold()
  }

  /**
   * Ends a hold whose time has come. The screen is not shown now: the next unlock does that
   * (design §6.9). Returns true when it ended one.
   */
  fun expireHoldIfDue(): Boolean {
    val hold = _state.value as? FocusState.OnHold ?: return false
    if (now().isBefore(hold.until)) return false
    clearHold()
    return true
  }

  fun onTaskSelected(taskId: String, taskName: String) {
    if (_state.value != FocusState.Prompting) return
    val running = FocusState.Running(newId(), taskId, taskName, now())
    _state.value = running
    enqueue {
      store.saveRunning(
        SavedSession(
          sessionId = running.sessionId,
          taskId = taskId,
          taskName = taskName,
          startedAt = running.startedAt,
          lastSeenAt = running.startedAt,
        ),
      )
      store.saveLastSelectedTaskId(taskId)
    }
    startTimers()
  }

  /**
   * The screen was left without a choice (Home, another app). There is no skip (M-14): nothing
   * is recorded and the screen comes back after `repromptAfterLeaveMs`, every time.
   */
  fun onLeave() {
    if (_state.value != FocusState.Prompting) return
    _state.value = FocusState.Away
    reprompt = scope.launch {
      delay(config.repromptAfterLeaveMs)
      reprompt = null
      // Same guard as the interval: in a call, wait for the next unlock instead.
      if (canPrompt()) prompt() else _state.value = FocusState.Idle
    }
  }

  fun onScreenOff() {
    when (_state.value) {
      is FocusState.Running -> finishSession(EndReason.SCREEN_OFF)
      FocusState.Prompting -> closeScreen()
      // The next unlock shows the screen anyway.
      FocusState.Away -> cancelReprompt()
      // A hold outlives screen offs; it is checked against the clock on unlock.
      is FocusState.OnHold, FocusState.Idle -> Unit
    }
  }

  /** Sign-out or the feature turned off: end everything. */
  fun stop() {
    when (_state.value) {
      is FocusState.Running -> finishSession(EndReason.APP_EXIT)
      FocusState.Prompting -> closeScreen()
      FocusState.Away -> cancelReprompt()
      is FocusState.OnHold -> clearHold()
      FocusState.Idle -> Unit
    }
  }

  /**
   * On service start: a session saved by a process that was killed is recorded as `app_exit`
   * up to its last confirmed time (§6.6). Does nothing while this process runs a session, whose
   * data is the one saved.
   */
  fun recover() {
    restoreHold()
    if (_state.value is FocusState.Running) return
    enqueue {
      val saved = store.loadRunning() ?: return@enqueue
      store.clearRunning()
      recordIfLongEnough(
        FinishedSession(
          id = saved.sessionId,
          taskId = saved.taskId,
          taskName = saved.taskName,
          startedAt = saved.startedAt,
          endedAt = saved.lastSeenAt,
          endReason = EndReason.APP_EXIT,
        ),
      )
    }
  }

  /**
   * Waits until every store write and recording queued so far has run. Sign-out calls it after
   * [stop] so the last session is recorded while the user is still signed in (design §7.2).
   */
  suspend fun flush() {
    val done = CompletableDeferred<Unit>()
    enqueue { done.complete(Unit) }
    done.await()
  }

  /** The only place a session ends. A second call for the same session does nothing. */
  private fun finishSession(reason: EndReason, endedAt: Instant = now()) {
    val running = _state.value as? FocusState.Running ?: return
    _state.value = FocusState.Idle
    timers?.cancel()
    timers = null
    val session = FinishedSession(
      id = running.sessionId,
      taskId = running.taskId,
      taskName = running.taskName,
      startedAt = running.startedAt,
      endedAt = endedAt,
      endReason = reason,
    )
    // Clear first: if the process dies right after recording, recovery must not count it again.
    enqueue {
      store.clearRunning()
      recordIfLongEnough(session)
    }
  }

  private fun startTimers() {
    timers = scope.launch {
      launch {
        while (true) {
          delay(config.lastSeenIntervalMs)
          val at = now()
          enqueue { store.updateLastSeen(at) }
        }
      }
      delay(config.intervalMs)
      // finishSession cancels this job; the rest runs because nothing below suspends.
      finishSession(EndReason.INTERVAL)
      if (canPrompt()) prompt()
    }
  }

  private fun prompt() {
    _state.value = FocusState.Prompting
    screen.show()
  }

  private fun closeScreen() {
    _state.value = FocusState.Idle
    screen.dismiss()
  }

  /**
   * A hold saved by an earlier process (reboot, update, forced stop) comes back; one that has
   * ended meanwhile is dropped. Applied only while nothing else is going on.
   */
  private fun restoreHold() {
    enqueue {
      val saved = store.loadHold() ?: return@enqueue
      if (!now().isBefore(saved.until)) {
        if (_state.value !is FocusState.OnHold) store.clearHold()
      } else if (_state.value == FocusState.Idle) {
        _state.value = FocusState.OnHold(saved.until, saved.reason)
      }
    }
  }

  private fun clearHold() {
    _state.value = FocusState.Idle
    enqueue { store.clearHold() }
  }

  private fun cancelReprompt() {
    reprompt?.cancel()
    reprompt = null
    _state.value = FocusState.Idle
  }

  private fun recordIfLongEnough(session: FinishedSession) {
    if (Duration.between(session.startedAt, session.endedAt).toMillis() >= config.minRecordMs) {
      recorder.record(session)
    }
  }

  private fun enqueue(op: suspend () -> Unit) {
    storeOps.trySend(op)
  }
}
