package dev.kaorukajihara.shiodoki.ui.unlock

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dev.kaorukajihara.shiodoki.auth.Account
import dev.kaorukajihara.shiodoki.auth.AuthManager
import dev.kaorukajihara.shiodoki.crypto.EncryptionManager
import dev.kaorukajihara.shiodoki.crypto.KeyState
import dev.kaorukajihara.shiodoki.crypto.SecretKind
import dev.kaorukajihara.shiodoki.focus.FocusFeature
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

/** After sign-in, until the data key is unlocked (docs/e2ee/design.md §5). */
class UnlockViewModel(
  private val encryption: EncryptionManager,
  private val authManager: AuthManager,
  private val focusFeature: FocusFeature,
) : ViewModel() {
  val keyState: StateFlow<KeyState> = encryption.state
  val account: StateFlow<Account?> = authManager.account

  var kind by mutableStateOf(SecretKind.PASSPHRASE)
    private set
  var secret by mutableStateOf("")
  var wrong by mutableStateOf(false)
    private set
  var busy by mutableStateOf(false)
    private set

  fun selectKind(next: SecretKind) {
    kind = next
    secret = ""
    wrong = false
  }

  fun onSecretChange(value: String) {
    secret = value
    wrong = false
  }

  /** On success the key state becomes Unlocked and the nav host leaves this screen. */
  fun unlock() {
    if (busy || secret.isEmpty()) return
    busy = true
    viewModelScope.launch {
      try {
        wrong = !encryption.unlock(kind, secret)
      } finally {
        busy = false
      }
    }
  }

  fun retry() = encryption.retry()

  /** Same as the settings screen (design §7.2); also forgets the data key kept on this phone. */
  fun signOut() {
    viewModelScope.launch {
      focusFeature.onSignOut()
      authManager.signOut()
    }
  }
}
