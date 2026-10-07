package dev.kaorukajihara.shiodoki.ui.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dev.kaorukajihara.shiodoki.auth.Account
import dev.kaorukajihara.shiodoki.auth.AuthManager
import dev.kaorukajihara.shiodoki.data.SyncStatus
import dev.kaorukajihara.shiodoki.data.TaskRepository
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class SettingsViewModel(
  private val authManager: AuthManager,
  repository: TaskRepository,
) : ViewModel() {
  val account: StateFlow<Account?> = authManager.account

  val syncStatus: StateFlow<SyncStatus?> = repository.snapshot
    .map { it?.syncStatus }
    .stateIn(
      viewModelScope,
      SharingStarted.WhileSubscribed(5_000),
      repository.snapshot.value?.syncStatus,
    )

  /**
   * A-04 (design §7.2). The task snapshot listener stops by itself when the uid becomes null.
   * Steps that do not exist yet (ending a focus session, stopping the service, clearing
   * DataStore) are added with those features.
   */
  fun signOut() {
    viewModelScope.launch { authManager.signOut() }
  }
}
