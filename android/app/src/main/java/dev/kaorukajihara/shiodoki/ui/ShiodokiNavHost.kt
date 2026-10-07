package dev.kaorukajihara.shiodoki.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavDestination.Companion.hasRoute
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import dev.kaorukajihara.shiodoki.AppContainer
import dev.kaorukajihara.shiodoki.ui.home.HomeScreen
import dev.kaorukajihara.shiodoki.ui.login.LoginScreen
import dev.kaorukajihara.shiodoki.ui.login.LoginViewModel
import dev.kaorukajihara.shiodoki.ui.settings.SettingsScreen
import dev.kaorukajihara.shiodoki.ui.settings.SettingsViewModel
import kotlinx.serialization.Serializable

@Serializable object LoginRoute
@Serializable object HomeRoute
@Serializable object SettingsRoute

/** Screens inside MainActivity (design §5.1). The auth state decides Login vs. the rest. */
@Composable
fun ShiodokiNavHost(container: AppContainer) {
  val authManager = container.authManager
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

  NavHost(navController, startDestination) {
    composable<LoginRoute> {
      LoginScreen(viewModel { LoginViewModel(authManager) })
    }
    composable<HomeRoute> {
      HomeScreen(
        account = account,
        onOpenSettings = { navController.navigate(SettingsRoute) },
      )
    }
    composable<SettingsRoute> {
      SettingsScreen(
        viewModel = viewModel { SettingsViewModel(authManager) },
        onBack = { navController.popBackStack() },
      )
    }
  }
}
