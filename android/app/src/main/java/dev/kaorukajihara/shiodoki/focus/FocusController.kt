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
) {
  companion object {
    val DEFAULT = FocusConfig(intervalMs = 30 * 60_000L, minRecordMs = 60_000L, lastSeenIntervalMs = 60_000L)
    val TEST = FocusConfig(intervalMs = 30_000L, minRecordMs = 5_000L, lastSeenIntervalMs = 5_000L)
  }
}

sealed interface FocusState {
  /** Nothing to do: after a skip or screen off, or when the screen was not shown (e.g. in a call). */
  data object Idle : FocusState

  /** The focus screen is showing. */
  data object Prompting : FocusState

  /** A phone session is running and the interval timer is ticking. */
  data class Running(
    val sessionId: String,
    val taskId: String,
    val taskName: String,
    val startedAt: Instant,
  ) : FocusState
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
    if (_state.value != FocusState.Idle || !canPrompt()) return
    prompt()
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

  /** Skip button or Back (M-14): nothing is recorded. */
  fun onSkip() {
    if (_state.value == FocusState.Prompting) _state.value = FocusState.Idle
  }

  fun onScreenOff() {
    when (_state.value) {
      is FocusState.Running -> finishSession(EndReason.SCREEN_OFF)
      FocusState.Prompting -> closeScreen()
      FocusState.Idle -> Unit
    }
  }

  /** Sign-out or the feature turned off: end everything. */
  fun stop() {
    when (_state.value) {
      is FocusState.Running -> finishSession(EndReason.APP_EXIT)
      FocusState.Prompting -> closeScreen()
      FocusState.Idle -> Unit
    }
  }

  /**
   * On service start: a session saved by a process that was killed is recorded as `app_exit`
   * up to its last confirmed time (§6.6). Does nothing while this process runs a session, whose
   * data is the one saved.
   */
  fun recover() {
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

  private fun recordIfLongEnough(session: FinishedSession) {
    if (Duration.between(session.startedAt, session.endedAt).toMillis() >= config.minRecordMs) {
      recorder.record(session)
    }
  }

  private fun enqueue(op: suspend () -> Unit) {
    storeOps.trySend(op)
  }
}
