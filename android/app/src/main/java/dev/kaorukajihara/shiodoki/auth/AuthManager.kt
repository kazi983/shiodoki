package dev.kaorukajihara.shiodoki.auth

import android.content.Context
import android.util.Log
import androidx.credentials.ClearCredentialStateRequest
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseUser
import com.google.firebase.auth.GoogleAuthProvider
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.tasks.await

data class Account(val uid: String, val email: String?)

/**
 * Google sign-in (Credential Manager) bridged to Firebase Auth (design §7).
 *
 * Firebase Auth keeps the session on the device, so [account] is non-null on later launches
 * even when offline (A-02).
 */
class AuthManager(
  private val auth: FirebaseAuth,
  private val credentialManager: CredentialManager,
  /** The web client ID created by Firebase, not the Android one (design §7.1). */
  private val webClientId: String,
  private val useEmulator: Boolean,
) {
  private val _account = MutableStateFlow(auth.currentUser?.toAccount())
  val account: StateFlow<Account?> = _account.asStateFlow()

  init {
    auth.addAuthStateListener { _account.value = it.currentUser?.toAccount() }
  }

  /**
   * Shows the Google account picker and signs in to Firebase.
   *
   * [activityContext] must be an Activity: Credential Manager draws its UI on top of it.
   * Throws `GetCredentialCancellationException` when the user closes the picker.
   */
  suspend fun signInWithGoogle(activityContext: Context) {
    val idToken = if (useEmulator) EMULATOR_ID_TOKEN else requestGoogleIdToken(activityContext)
    auth.signInWithCredential(GoogleAuthProvider.getCredential(idToken, null)).await()
  }

  suspend fun signOut() {
    auth.signOut()
    try {
      // Without this, the next sign-in silently reuses the same Google account.
      credentialManager.clearCredentialState(ClearCredentialStateRequest())
    } catch (e: Exception) {
      Log.w(TAG, "clearCredentialState failed", e)
    }
  }

  private suspend fun requestGoogleIdToken(activityContext: Context): String {
    val request = GetCredentialRequest.Builder()
      .addCredentialOption(GetSignInWithGoogleOption.Builder(webClientId).build())
      .build()
    val credential = credentialManager.getCredential(activityContext, request).credential
    check(
      credential is CustomCredential &&
        credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL,
    ) { "Unexpected credential type: ${credential.type}" }
    return GoogleIdTokenCredential.createFrom(credential.data).idToken
  }

  private fun FirebaseUser.toAccount() = Account(uid = uid, email = email)

  private companion object {
    const val TAG = "AuthManager"

    /**
     * The Auth emulator accepts an unsigned JSON ID token. Same fake account as the desktop
     * E2E (`TIMER_FIREBASE_EMULATOR=1`), so both apps get the same user when they use the
     * same emulator project.
     */
    const val EMULATOR_ID_TOKEN =
      """{"sub":"e2e-user","email":"e2e@example.com","email_verified":true}"""
  }
}
