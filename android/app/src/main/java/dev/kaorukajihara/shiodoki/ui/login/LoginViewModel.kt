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

data class LoginUiState(val busy: Boolean = false, val error: String? = null)

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
      } catch (_: GetCredentialCancellationException) {
        null // The user closed the picker: show nothing (design §5.2).
      } catch (_: NoCredentialException) {
        "この端末に Google アカウントがありません"
      } catch (e: Exception) {
        Log.w(TAG, "Sign-in failed", e)
        "ログインできませんでした: ${e.localizedMessage ?: e.javaClass.simpleName}"
      }
      _state.update { it.copy(busy = false, error = error) }
    }
  }

  private companion object {
    const val TAG = "LoginViewModel"
  }
}
