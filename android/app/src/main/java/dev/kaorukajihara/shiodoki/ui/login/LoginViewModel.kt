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
        // The user closed the picker: show nothing (design §5.2). Credential Manager also
        // reports a misconfigured client (SHA-1 not registered for this package) as a
        // cancellation ("[16] Account reauth failed"), so log it to tell the two apart.
        Log.i(TAG, "Sign-in cancelled: ${e.message}")
        null
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
