package dev.kaorukajihara.shiodoki

import android.content.Context
import android.util.Log
import androidx.credentials.CredentialManager
import com.google.firebase.Firebase
import com.google.firebase.auth.auth
import com.google.firebase.firestore.firestore
import dev.kaorukajihara.shiodoki.auth.AuthManager
import dev.kaorukajihara.shiodoki.data.DesktopStateRepository
import dev.kaorukajihara.shiodoki.data.FirestoreDesktopStateRepository
import dev.kaorukajihara.shiodoki.data.FirestoreSessionRecorder
import dev.kaorukajihara.shiodoki.data.FirestoreTaskRepository
import dev.kaorukajihara.shiodoki.data.LocalStore
import dev.kaorukajihara.shiodoki.data.TaskRepository
import dev.kaorukajihara.shiodoki.focus.ActivityFocusScreen
import dev.kaorukajihara.shiodoki.focus.DeviceGuards
import dev.kaorukajihara.shiodoki.focus.FocusController
import dev.kaorukajihara.shiodoki.focus.FocusFeature
import dev.kaorukajihara.shiodoki.focus.FocusPermission
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

  private val uid = authManager.account
    .map { it?.uid }
    .stateIn(appScope, SharingStarted.Eagerly, authManager.account.value?.uid)

  val taskRepository: TaskRepository = FirestoreTaskRepository(firestore, uid, appScope)

  val desktopStateRepository: DesktopStateRepository =
    FirestoreDesktopStateRepository(firestore, uid, appScope)

  val localStore = LocalStore(context)

  /**
   * The focus state machine, shared by FocusService and FocusActivity (design §6.1). Its scope
   * runs on the main thread like the broadcasts and UI events that drive it.
   */
  val focusController: FocusController = run {
    val appContext = context.applicationContext
    val deviceGuards = DeviceGuards(appContext)
    FocusController(
      scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate),
      store = localStore,
      recorder = FirestoreSessionRecorder(firestore, uid),
      screen = ActivityFocusScreen(appContext),
      canPrompt = {
        val signedIn = authManager.account.value != null
        val overlay = FocusPermission.OVERLAY.isGranted(appContext)
        val busy = deviceGuards.isBusy()
        // Logged so "the screen did not appear" can be explained from logcat.
        if (!signedIn || !overlay || busy) {
          Log.i(TAG, "Focus screen not shown: signedIn=$signedIn overlay=$overlay busy=$busy")
        }
        signedIn && overlay && !busy
      },
      onStoreError = { Log.w(TAG, "Focus store write failed", it) },
    )
  }

  val focusFeature = FocusFeature(context.applicationContext, localStore, focusController)

  private companion object {
    const val TAG = "AppContainer"

    /** The host PC as seen from the Android Emulator. */
    const val EMULATOR_HOST = "10.0.2.2"
  }
}
