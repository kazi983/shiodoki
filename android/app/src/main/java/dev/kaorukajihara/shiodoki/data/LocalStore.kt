package dev.kaorukajihara.shiodoki.data

import android.content.Context
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import dev.kaorukajihara.shiodoki.focus.FocusStore
import dev.kaorukajihara.shiodoki.focus.SavedSession
import java.time.Instant
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

private val Context.dataStore by preferencesDataStore(name = "local")

/** Small on-device settings and state (design §2: DataStore). Not synced. */
class LocalStore(context: Context) : FocusStore {
  private val dataStore = context.applicationContext.dataStore

  /** The focus screen switch in the settings (M-16). A device setting, kept on sign-out. */
  val focusEnabled: Flow<Boolean> = dataStore.data.map { it[FOCUS_ENABLED] ?: false }

  /** The phone's previous choice (M-12). */
  val lastSelectedTaskId: Flow<String?> = dataStore.data.map { it[LAST_SELECTED_TASK_ID] }

  suspend fun setFocusEnabled(enabled: Boolean) {
    dataStore.edit { it[FOCUS_ENABLED] = enabled }
  }

  /** Sign-out (design §7.2 step 6): drop everything that belongs to the account. */
  suspend fun clearUserData() {
    dataStore.edit { prefs ->
      prefs.remove(LAST_SELECTED_TASK_ID)
      RUNNING_KEYS.forEach { prefs.remove(it) }
    }
  }

  override suspend fun loadRunning(): SavedSession? {
    val p = dataStore.data.first()
    return SavedSession(
      sessionId = p[RUNNING_SESSION_ID] ?: return null,
      taskId = p[RUNNING_TASK_ID] ?: return null,
      taskName = p[RUNNING_TASK_NAME] ?: "",
      startedAt = Instant.ofEpochMilli(p[RUNNING_STARTED_AT] ?: return null),
      lastSeenAt = Instant.ofEpochMilli(p[RUNNING_LAST_SEEN_AT] ?: return null),
    )
  }

  override suspend fun saveRunning(session: SavedSession) {
    dataStore.edit {
      it[RUNNING_SESSION_ID] = session.sessionId
      it[RUNNING_TASK_ID] = session.taskId
      it[RUNNING_TASK_NAME] = session.taskName
      it[RUNNING_STARTED_AT] = session.startedAt.toEpochMilli()
      it[RUNNING_LAST_SEEN_AT] = session.lastSeenAt.toEpochMilli()
    }
  }

  override suspend fun updateLastSeen(at: Instant) {
    dataStore.edit {
      if (it.contains(RUNNING_SESSION_ID)) it[RUNNING_LAST_SEEN_AT] = at.toEpochMilli()
    }
  }

  override suspend fun clearRunning() {
    dataStore.edit { prefs -> RUNNING_KEYS.forEach { prefs.remove(it) } }
  }

  override suspend fun saveLastSelectedTaskId(taskId: String) {
    dataStore.edit { it[LAST_SELECTED_TASK_ID] = taskId }
  }

  private companion object {
    val FOCUS_ENABLED = booleanPreferencesKey("focusEnabled")
    val LAST_SELECTED_TASK_ID = stringPreferencesKey("lastSelectedTaskId")

    // The running session (design §6.6).
    val RUNNING_SESSION_ID = stringPreferencesKey("runningSessionId")
    val RUNNING_TASK_ID = stringPreferencesKey("runningTaskId")
    val RUNNING_TASK_NAME = stringPreferencesKey("runningTaskName")
    val RUNNING_STARTED_AT = longPreferencesKey("runningStartedAt")
    val RUNNING_LAST_SEEN_AT = longPreferencesKey("runningLastSeenAt")
    val RUNNING_KEYS: List<Preferences.Key<*>> = listOf(
      RUNNING_SESSION_ID, RUNNING_TASK_ID, RUNNING_TASK_NAME, RUNNING_STARTED_AT, RUNNING_LAST_SEEN_AT,
    )
  }
}
