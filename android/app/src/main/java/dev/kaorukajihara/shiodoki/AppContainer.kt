package dev.kaorukajihara.shiodoki

import android.content.Context
import androidx.credentials.CredentialManager
import com.google.firebase.Firebase
import com.google.firebase.auth.auth
import com.google.firebase.firestore.firestore
import dev.kaorukajihara.shiodoki.auth.AuthManager
import dev.kaorukajihara.shiodoki.data.FirestoreTaskRepository
import dev.kaorukajihara.shiodoki.data.TaskRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn

/** Hand-written dependency container, one per process (design §2: no Hilt). */
class AppContainer(context: Context) {
  /** Lives as long as the process; holds process-wide listeners such as the task snapshot. */
  private val appScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

  // useEmulator() must run before any other use of each instance.
  private val auth = Firebase.auth.apply {
    if (BuildConfig.USE_FIREBASE_EMULATOR) useEmulator(EMULATOR_HOST, 9099)
  }
  private val firestore = Firebase.firestore.apply {
    if (BuildConfig.USE_FIREBASE_EMULATOR) useEmulator(EMULATOR_HOST, 8080)
  }

  val authManager = AuthManager(
    auth = auth,
    credentialManager = CredentialManager.create(context),
    webClientId = context.getString(R.string.default_web_client_id),
    useEmulator = BuildConfig.USE_FIREBASE_EMULATOR,
  )

  val taskRepository: TaskRepository = FirestoreTaskRepository(
    db = firestore,
    uid = authManager.account
      .map { it?.uid }
      .stateIn(appScope, SharingStarted.Eagerly, authManager.account.value?.uid),
    scope = appScope,
  )

  private companion object {
    /** The host PC as seen from the Android Emulator. */
    const val EMULATOR_HOST = "10.0.2.2"
  }
}
