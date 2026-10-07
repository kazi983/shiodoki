package dev.kaorukajihara.shiodoki.ui.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dev.kaorukajihara.shiodoki.auth.Account
import dev.kaorukajihara.shiodoki.auth.AuthManager
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

class SettingsViewModel(private val authManager: AuthManager) : ViewModel() {
  val account: StateFlow<Account?> = authManager.account

  /**
   * A-04 (design §7.2). Steps that do not exist yet (ending a focus session, stopping the
   * service, unsubscribing snapshots, clearing DataStore) are added with those features.
   */
  fun signOut() {
    viewModelScope.launch { authManager.signOut() }
  }
}
