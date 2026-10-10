package dev.kaorukajihara.shiodoki

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
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
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
    setContent {
      ShiodokiTheme {
        ShiodokiNavHost(container)
      }
    }
  }
}
