package dev.kaorukajihara.shiodoki.ui.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle

/** Design §5.6. Only the account section exists for now. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(viewModel: SettingsViewModel, onBack: () -> Unit) {
  val account by viewModel.account.collectAsStateWithLifecycle()
  var confirmSignOut by rememberSaveable { mutableStateOf(false) }

  Scaffold(
    topBar = {
      TopAppBar(
        title = { Text("設定") },
        navigationIcon = {
          IconButton(onClick = onBack) {
            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "戻る")
          }
        },
      )
    },
  ) { padding ->
    Column(
      modifier = Modifier.fillMaxSize().padding(padding).padding(16.dp),
      verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
      Text("ログイン中のアカウント", style = MaterialTheme.typography.titleSmall)
      Text(account?.email ?: "-")
      OutlinedButton(onClick = { confirmSignOut = true }) {
        Text("ログアウト")
      }
    }
  }

  if (confirmSignOut) {
    AlertDialog(
      onDismissRequest = { confirmSignOut = false },
      title = { Text("ログアウトしますか？") },
      confirmButton = {
        TextButton(onClick = {
          confirmSignOut = false
          viewModel.signOut()
        }) { Text("ログアウト") }
      },
      dismissButton = {
        TextButton(onClick = { confirmSignOut = false }) { Text("キャンセル") }
      },
    )
  }
}
