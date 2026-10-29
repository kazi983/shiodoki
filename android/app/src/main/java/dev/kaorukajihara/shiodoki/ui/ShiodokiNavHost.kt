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
import dev.kaorukajihara.shiodoki.crypto.KeyState
import dev.kaorukajihara.shiodoki.ui.all.AllTasksScreen
import dev.kaorukajihara.shiodoki.ui.all.AllTasksViewModel
import dev.kaorukajihara.shiodoki.ui.components.MainTab
import dev.kaorukajihara.shiodoki.ui.edit.EditTaskScreen
import dev.kaorukajihara.shiodoki.ui.edit.EditTaskViewModel
import dev.kaorukajihara.shiodoki.ui.home.HomeScreen
import dev.kaorukajihara.shiodoki.ui.home.HomeViewModel
import dev.kaorukajihara.shiodoki.ui.login.LoginScreen
import dev.kaorukajihara.shiodoki.ui.login.LoginViewModel
import dev.kaorukajihara.shiodoki.ui.settings.SettingsScreen
import dev.kaorukajihara.shiodoki.ui.settings.SettingsViewModel
import dev.kaorukajihara.shiodoki.ui.unlock.UnlockScreen
import dev.kaorukajihara.shiodoki.ui.unlock.UnlockViewModel
import kotlinx.serialization.Serializable

@Serializable object LoginRoute
@Serializable object UnlockRoute
@Serializable object HomeRoute
@Serializable object AllTasksRoute
@Serializable object SettingsRoute

/** taskId == null adds a new task. */
@Serializable data class EditTaskRoute(val taskId: String? = null)

/** Where the auth and key state put the user: Login, Unlock, or the app itself (Home). */
private enum class Gate(val route: Any) {
  LOGIN(LoginRoute),
  UNLOCK(UnlockRoute),
  APP(HomeRoute),
}

/**
 * Screens inside MainActivity (design §5.1). The auth state decides Login vs. the rest, then the data key decides
 * Unlock vs. the app (docs/e2ee/design.md §5).
 */
@Composable
fun ShiodokiNavHost(container: AppContainer) {
  val authManager = container.authManager
  val taskRepository = container.taskRepository
  val desktopStateRepository = container.desktopStateRepository
  val account by authManager.account.collectAsStateWithLifecycle()
  val keyState by container.encryption.state.collectAsStateWithLifecycle()
  val gate = when {
    account == null -> Gate.LOGIN
    keyState == KeyState.Unlocked -> Gate.APP
    else -> Gate.UNLOCK
  }
  val navController = rememberNavController()
  val startDestination: Any = remember { gate.route }

  // Follow sign-in / sign-out (including a session expiring) and unlocking, and clear the back stack.
  LaunchedEffect(gate) {
    val destination = navController.currentDestination
    val current = when {
      destination?.hasRoute<LoginRoute>() == true -> Gate.LOGIN
      destination?.hasRoute<UnlockRoute>() == true -> Gate.UNLOCK
      else -> Gate.APP
    }
    if (gate != current) {
      navController.navigate(gate.route) {
        popUpTo(navController.graph.id) { inclusive = true }
      }
    }
  }

  // Bottom tabs (design canvas). Home stays at the bottom of the stack, so Back on another tab
  // returns to it, like a standard Android bottom navigation.
  val selectTab: (MainTab) -> Unit = { tab ->
    when (tab) {
      MainTab.TASKS -> navController.popBackStack<HomeRoute>(inclusive = false)
      MainTab.ALL -> navController.navigate(AllTasksRoute) {
        popUpTo<HomeRoute>()
        launchSingleTop = true
      }
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
    composable<UnlockRoute> {
      UnlockScreen(viewModel { UnlockViewModel(container.encryption, authManager, container.focusFeature) })
    }
    composable<HomeRoute> {
      HomeScreen(
        viewModel = viewModel { HomeViewModel(taskRepository, desktopStateRepository) },
        onAddTask = { navController.navigate(EditTaskRoute()) },
        onEditTask = { navController.navigate(EditTaskRoute(it)) },
        onSelectTab = selectTab,
      )
    }
    composable<AllTasksRoute> {
      AllTasksScreen(
        viewModel = viewModel { AllTasksViewModel(taskRepository) },
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
