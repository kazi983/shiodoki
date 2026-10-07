package dev.kaorukajihara.shiodoki.ui.home

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import dev.kaorukajihara.shiodoki.auth.Account

/**
 * Placeholder until design step 2 adds the task list. Shows the uid so it can be compared with
 * the desktop app (step 1 acceptance check).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(account: Account?, onOpenSettings: () -> Unit) {
  Scaffold(
    topBar = {
      TopAppBar(
        title = { Text("Shiodoki") },
        actions = {
          IconButton(onClick = onOpenSettings) {
            Icon(Icons.Filled.Settings, contentDescription = "設定")
          }
        },
      )
    },
  ) { padding ->
    Column(
      modifier = Modifier.fillMaxSize().padding(padding).padding(16.dp),
      verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
      Text("ログイン中: ${account?.email ?: "-"}")
      Text("uid: ${account?.uid ?: "-"}", style = MaterialTheme.typography.bodySmall)
      Text("タスク一覧はこれから実装します", color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
  }
}
