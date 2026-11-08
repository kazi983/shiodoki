package dev.kaorukajihara.shiodoki.ui.login

import android.content.Context
import android.util.Log
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.NoCredentialException
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dev.kaorukajihara.shiodoki.auth.AuthManager
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** Why sign-in failed. The screen turns it into a message. */
sealed interface LoginError {
  data object NoAccount : LoginError

  data class Failed(val detail: String) : LoginError

  /**
   * Google refused the account after it was picked: this build's signing key (SHA-1) is not registered for its
   * package, or the registration has not reached Google yet.
   */
  data class Rejected(val detail: String) : LoginError
}

/**
 * Credential Manager reports both the user closing the picker and Google refusing the picked account (a SHA-1 not
 * registered for this package: "[16] Account reauth failed.") as a cancellation. Only the first one is silent
 * (design §5.2); the message is the only way to tell them apart.
 */
internal fun cancellationError(message: String?): LoginError? {
  if (message == null) return null
  val lower = message.lowercase()
  val closedByUser = "user" in lower && ("cancel" in lower || "dismiss" in lower)
  return if (closedByUser) null else LoginError.Rejected(message)
}

data class LoginUiState(val busy: Boolean = false, val error: LoginError? = null)

class LoginViewModel(private val authManager: AuthManager) : ViewModel() {
  private val _state = MutableStateFlow(LoginUiState())
  val state: StateFlow<LoginUiState> = _state.asStateFlow()

  /** On success the auth state changes and the nav host leaves the login screen. */
  fun signIn(activityContext: Context) {
    if (_state.value.busy) return
    _state.value = LoginUiState(busy = true)
    viewModelScope.launch {
      val error = try {
        authManager.signInWithGoogle(activityContext)
        null
      } catch (e: CancellationException) {
        throw e
      } catch (e: GetCredentialCancellationException) {
        Log.i(TAG, "Sign-in cancelled: ${e.message}")
        cancellationError(e.message)
      } catch (_: NoCredentialException) {
        LoginError.NoAccount
      } catch (e: Exception) {
        Log.w(TAG, "Sign-in failed", e)
        LoginError.Failed(e.localizedMessage ?: e.javaClass.simpleName)
      }
      _state.update { it.copy(busy = false, error = error) }
    }
  }

  private companion object {
    const val TAG = "LoginViewModel"
  }
}
