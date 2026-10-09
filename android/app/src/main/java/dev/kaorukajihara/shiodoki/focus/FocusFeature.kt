package dev.kaorukajihara.shiodoki.focus

import android.content.Context
import dev.kaorukajihara.shiodoki.data.LocalStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first

/** Turns the focus feature on and off and starts [FocusService] when it should run (design §6.5). */
class FocusFeature(
  private val context: Context,
  private val localStore: LocalStore,
  private val controller: FocusController,
) {
  val enabled: Flow<Boolean> = localStore.focusEnabled

  suspend fun setEnabled(enabled: Boolean) {
    localStore.setFocusEnabled(enabled)
    // Turning on happens in the settings screen (foreground), so starting is allowed. Turning
    // off ends a running session through FocusService.onDestroy.
    if (enabled) FocusService.start(context) else FocusService.stop(context)
  }

  /**
   * Only from the foreground (app launch) or BOOT_COMPLETED: Android 15 no longer lets the
   * overlay permission alone start a foreground service from the background (design §6.5).
   */
  suspend fun startIfEnabled(signedIn: Boolean) {
    if (signedIn && enabled.first()) FocusService.start(context)
  }

  /** Design §7.2 steps 2, 3 and 6, before Firebase signs out. */
  suspend fun onSignOut() {
    controller.stop()
    controller.flush()
    FocusService.stop(context)
    localStore.clearUserData()
  }
}
