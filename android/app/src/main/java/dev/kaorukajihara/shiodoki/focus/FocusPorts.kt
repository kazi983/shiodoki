package dev.kaorukajihara.shiodoki.focus

import dev.kaorukajihara.shiodoki.model.FinishedSession
import java.time.Instant

/** Writes a finished session and its task counters in one batch, without waiting (design §4.4). */
fun interface SessionRecorder {
  fun record(session: FinishedSession)
}

/** The running session as saved on the device, for recovery after a forced stop (design §6.6). */
data class SavedSession(
  val sessionId: String,
  val taskId: String,
  val taskName: String,
  val startedAt: Instant,
  val lastSeenAt: Instant,
)

/** The focus part of the on-device store (`LocalStore`, DataStore). */
interface FocusStore {
  suspend fun loadRunning(): SavedSession?

  suspend fun saveRunning(session: SavedSession)

  /** Does nothing when no session is saved. */
  suspend fun updateLastSeen(at: Instant)

  suspend fun clearRunning()

  /** The phone's previous choice (M-12); `state/preferences` is not touched. */
  suspend fun saveLastSelectedTaskId(taskId: String)
}

/** Shows or closes the focus screen (`FocusActivity`, design §6.4). */
interface FocusScreen {
  fun show()

  fun dismiss()
}
