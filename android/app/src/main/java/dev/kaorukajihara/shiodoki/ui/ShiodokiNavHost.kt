package dev.kaorukajihara.shiodoki.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavDestination.Companion.hasRoute
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.toRoute
import dev.kaorukajihara.shiodoki.AppContainer
import dev.kaorukajihara.shiodoki.ui.components.MainTab
import dev.kaorukajihara.shiodoki.ui.edit.EditTaskScreen
import dev.kaorukajihara.shiodoki.ui.edit.EditTaskViewModel
import dev.kaorukajihara.shiodoki.ui.home.HomeScreen
import dev.kaorukajihara.shiodoki.ui.home.HomeViewModel
import dev.kaorukajihara.shiodoki.ui.login.LoginScreen
import dev.kaorukajihara.shiodoki.ui.login.LoginViewModel
import dev.kaorukajihara.shiodoki.ui.settings.SettingsScreen
import dev.kaorukajihara.shiodoki.ui.settings.SettingsViewModel
import kotlinx.serialization.Serializable

@Serializable object LoginRoute
@Serializable object HomeRoute
@Serializable object SettingsRoute

/** taskId == null adds a new task. */
@Serializable data class EditTaskRoute(val taskId: String? = null)

/** Screens inside MainActivity (design §5.1). The auth state decides Login vs. the rest. */
@Composable
fun ShiodokiNavHost(container: AppContainer) {
  val authManager = container.authManager
  val taskRepository = container.taskRepository
  val desktopStateRepository = container.desktopStateRepository
  val account by authManager.account.collectAsStateWithLifecycle()
  val signedIn = account != null
  val navController = rememberNavController()
  val startDestination: Any = remember { if (signedIn) HomeRoute else LoginRoute }

  // Follow sign-in / sign-out (including a session expiring) and clear the back stack.
  LaunchedEffect(signedIn) {
    val onLogin = navController.currentDestination?.hasRoute<LoginRoute>() == true
    if (signedIn == onLogin) {
      navController.navigate(if (signedIn) HomeRoute else LoginRoute) {
        popUpTo(navController.graph.id) { inclusive = true }
      }
    }
  }

  // Bottom tabs (design canvas). Home stays at the bottom of the stack, so Back on another tab
  // returns to it, like a standard Android bottom navigation.
  val selectTab: (MainTab) -> Unit = { tab ->
    when (tab) {
      MainTab.TASKS -> navController.popBackStack<HomeRoute>(inclusive = false)
      MainTab.SETTINGS -> navController.navigate(SettingsRoute) {
        popUpTo<HomeRoute>()
        launchSingleTop = true
      }
    }
  }

  NavHost(navController, startDestination) {
    composable<LoginRoute> {
      LoginScreen(viewModel { LoginViewModel(authManager) })
    }
    composable<HomeRoute> {
      HomeScreen(
        viewModel = viewModel { HomeViewModel(taskRepository, desktopStateRepository) },
        onAddTask = { navController.navigate(EditTaskRoute()) },
        onEditTask = { navController.navigate(EditTaskRoute(it)) },
        onSelectTab = selectTab,
      )
    }
    composable<EditTaskRoute> { entry ->
      val route = entry.toRoute<EditTaskRoute>()
      EditTaskScreen(
        viewModel = viewModel { EditTaskViewModel(taskRepository, route.taskId) },
        // Ignore a second tap while the pop animation runs; it would pop Home as well.
        onClose = {
          if (entry.lifecycle.currentState == Lifecycle.State.RESUMED) navController.popBackStack()
        },
      )
    }
    composable<SettingsRoute> {
      SettingsScreen(
        viewModel = viewModel { SettingsViewModel(authManager, taskRepository, container.focusFeature) },
        onSelectTab = selectTab,
      )
    }
  }
}
