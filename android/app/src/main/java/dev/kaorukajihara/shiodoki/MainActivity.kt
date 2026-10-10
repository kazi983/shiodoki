package dev.kaorukajihara.shiodoki

import android.os.Bundle
import android.graphics.Color
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import dev.kaorukajihara.shiodoki.ui.ShiodokiNavHost
import dev.kaorukajihara.shiodoki.ui.theme.ShiodokiTheme

class MainActivity : ComponentActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    // The app is always dark, so keep light system bar icons regardless of the system theme.
    enableEdgeToEdge(
      statusBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
      navigationBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
    )
    val container = (application as ShiodokiApp).container
    setContent {
      ShiodokiTheme {
        ShiodokiNavHost(container)
      }
    }
  }
}
