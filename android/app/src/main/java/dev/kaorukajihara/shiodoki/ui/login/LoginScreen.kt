package dev.kaorukajihara.shiodoki.ui.login

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle

/** M-01: a single "sign in with Google" button (design §5.2). */
@Composable
fun LoginScreen(viewModel: LoginViewModel) {
  val state by viewModel.state.collectAsStateWithLifecycle()
  // The Activity context: Credential Manager shows its picker on top of it.
  val context = LocalContext.current

  Scaffold { padding ->
    Column(
      modifier = Modifier.fillMaxSize().padding(padding).padding(24.dp),
      verticalArrangement = Arrangement.spacedBy(24.dp, Alignment.CenterVertically),
      horizontalAlignment = Alignment.CenterHorizontally,
    ) {
      Text("Shiodoki", style = MaterialTheme.typography.headlineLarge)
      if (state.busy) {
        CircularProgressIndicator()
      } else {
        Button(onClick = { viewModel.signIn(context) }) {
          Text("Google でログイン")
        }
      }
      state.error?.let {
        Text(it, color = MaterialTheme.colorScheme.error)
      }
    }
  }
}
