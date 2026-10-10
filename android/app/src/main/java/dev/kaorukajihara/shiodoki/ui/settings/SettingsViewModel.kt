package dev.kaorukajihara.shiodoki.ui.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dev.kaorukajihara.shiodoki.auth.Account
import dev.kaorukajihara.shiodoki.auth.AuthManager
import dev.kaorukajihara.shiodoki.data.SyncStatus
import dev.kaorukajihara.shiodoki.data.TaskRepository
import dev.kaorukajihara.shiodoki.focus.FocusFeature
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class SettingsViewModel(
  private val authManager: AuthManager,
  repository: TaskRepository,
  private val focusFeature: FocusFeature,
) : ViewModel() {
  val account: StateFlow<Account?> = authManager.account

  val syncStatus: StateFlow<SyncStatus?> = repository.snapshot
    .map { it?.syncStatus }
    .stateIn(
      viewModelScope,
      SharingStarted.WhileSubscribed(5_000),
      repository.snapshot.value?.syncStatus,
    )

  /** null until DataStore is read, so the switch does not flash "off". */
  val focusEnabled: StateFlow<Boolean?> = focusFeature.enabled
    .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

  fun setFocusEnabled(enabled: Boolean) {
    viewModelScope.launch { focusFeature.setEnabled(enabled) }
  }

  /**
   * A-04 (design §7.2): record a running phone session, stop the service and clear the
   * account's local data while still signed in, then sign out. The task snapshot listener stops
   * by itself when the uid becomes null.
   */
  fun signOut() {
    viewModelScope.launch {
      focusFeature.onSignOut()
      authManager.signOut()
    }
  }
}
