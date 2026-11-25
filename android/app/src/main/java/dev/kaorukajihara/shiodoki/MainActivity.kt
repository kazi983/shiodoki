package dev.kaorukajihara.shiodoki

import android.content.Intent
import android.os.Bundle
import android.graphics.Color
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import dev.kaorukajihara.shiodoki.ui.ShiodokiNavHost
import dev.kaorukajihara.shiodoki.ui.theme.ShiodokiTheme
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
  /** Set by the off reminder (design §6.10); the settings screen is opened once, then cleared. */
  private val openSettings = MutableStateFlow(false)

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    // The app is always dark, so keep light system bar icons regardless of the system theme.
    enableEdgeToEdge(
      statusBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
      navigationBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
    )
    val container = (application as ShiodokiApp).container
    // Start the focus service while in the foreground: on launch and right after sign-in
    // (design §6.5). Starting it again when it already runs does nothing.
    lifecycleScope.launch {
      repeatOnLifecycle(Lifecycle.State.STARTED) {
        container.authManager.account.collect { container.focusFeature.startIfEnabled(it != null) }
      }
    }
    if (savedInstanceState == null) takeOpenSettings(intent)
    setContent {
      ShiodokiTheme {
        ShiodokiNavHost(container, openSettings, onSettingsOpened = { openSettings.value = false })
      }
    }
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    takeOpenSettings(intent)
  }

  private fun takeOpenSettings(intent: Intent?) {
    if (intent?.getBooleanExtra(EXTRA_OPEN_SETTINGS, false) == true) openSettings.value = true
  }

  companion object {
    const val EXTRA_OPEN_SETTINGS = "dev.kaorukajihara.shiodoki.extra.OPEN_SETTINGS"
  }
}
