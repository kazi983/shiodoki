package dev.kaorukajihara.shiodoki

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import dev.kaorukajihara.shiodoki.ui.ShiodokiNavHost
import dev.kaorukajihara.shiodoki.ui.theme.ShiodokiTheme

class MainActivity : ComponentActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    enableEdgeToEdge()
    val container = (application as ShiodokiApp).container
    setContent {
      ShiodokiTheme {
        ShiodokiNavHost(container)
      }
    }
  }
}
