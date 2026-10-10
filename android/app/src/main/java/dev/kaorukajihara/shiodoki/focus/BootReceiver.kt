package dev.kaorukajihara.shiodoki.focus

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import dev.kaorukajihara.shiodoki.ShiodokiApp
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/** Starts [FocusService] after a reboot or an app update when the feature is on (design §6.1). */
class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Intent.ACTION_BOOT_COMPLETED &&
      intent.action != Intent.ACTION_MY_PACKAGE_REPLACED
    ) {
      return
    }
    val container = (context.applicationContext as ShiodokiApp).container
    // Reading DataStore suspends; goAsync keeps the receiver alive until it is done.
    val pending = goAsync()
    CoroutineScope(Dispatchers.Main).launch {
      try {
        container.focusFeature.startIfEnabled(signedIn = container.authManager.account.value != null)
      } finally {
        pending.finish()
      }
    }
  }
}
