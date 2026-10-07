package dev.kaorukajihara.shiodoki

import android.content.Context
import androidx.credentials.CredentialManager
import com.google.firebase.Firebase
import com.google.firebase.auth.auth
import dev.kaorukajihara.shiodoki.auth.AuthManager

/** Hand-written dependency container, one per process (design §2: no Hilt). */
class AppContainer(context: Context) {
  private val auth = Firebase.auth.apply {
    // Must run before any other use of the instance.
    if (BuildConfig.USE_FIREBASE_EMULATOR) useEmulator(EMULATOR_HOST, 9099)
  }

  val authManager = AuthManager(
    auth = auth,
    credentialManager = CredentialManager.create(context),
    webClientId = context.getString(R.string.default_web_client_id),
    useEmulator = BuildConfig.USE_FIREBASE_EMULATOR,
  )

  private companion object {
    /** The host PC as seen from the Android Emulator. */
    const val EMULATOR_HOST = "10.0.2.2"
  }
}
