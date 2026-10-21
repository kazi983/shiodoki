package dev.kaorukajihara.shiodoki.focus

import android.graphics.Color
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.viewmodel.compose.viewModel
import dev.kaorukajihara.shiodoki.ShiodokiApp
import dev.kaorukajihara.shiodoki.ui.focus.FocusContent
import dev.kaorukajihara.shiodoki.ui.focus.FocusViewModel
import dev.kaorukajihara.shiodoki.ui.theme.ShiodokiTheme
import kotlinx.coroutines.launch

/**
 * The focus screen (design §5.7, §6.4). Its own task, excluded from recents and never over the
 * lock screen (manifest). It never decides when to close: it follows [FocusController.state].
 */
class FocusActivity : ComponentActivity() {
  private val controller by lazy { (application as ShiodokiApp).container.focusController }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    enableEdgeToEdge(
      statusBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
      navigationBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
    )
    // Full screen except the status bar (design §5.7). A swipe from the edge shows the
    // navigation bar for a moment, so Home stays reachable (the screen comes back a minute
    // later). Back does nothing.
    WindowCompat.getInsetsController(window, window.decorView).apply {
      systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
      hide(WindowInsetsCompat.Type.navigationBars())
    }
    // Not tied to STARTED: after a screen off the activity is stopped, and it must still close.
    lifecycleScope.launch {
      controller.state.collect { if (it != FocusState.Prompting) finishAndRemoveTask() }
    }
    val container = (application as ShiodokiApp).container
    setContent {
      ShiodokiTheme {
        FocusContent(
          viewModel {
            FocusViewModel(
              repository = container.taskRepository,
              desktopStateRepository = container.desktopStateRepository,
              lastSelectedTaskId = container.localStore.lastSelectedTaskId,
              startTask = controller::onTaskSelected,
            )
          },
        )
      }
    }
  }

  /**
   * Leaving without a choice (Home, another app) shows the screen again a minute later (M-14).
   * Back never gets here: FocusContent consumes it. After a choice the state is Running, and
   * after a screen off Idle, so this does nothing.
   */
  override fun onStop() {
    super.onStop()
    if (!isChangingConfigurations) controller.onLeave()
  }
}
