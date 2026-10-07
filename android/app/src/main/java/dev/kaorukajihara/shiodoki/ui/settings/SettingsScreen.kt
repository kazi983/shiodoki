package dev.kaorukajihara.shiodoki.ui.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dev.kaorukajihara.shiodoki.ui.components.MainBottomBar
import dev.kaorukajihara.shiodoki.ui.components.MainTab
import dev.kaorukajihara.shiodoki.ui.components.ScreenHeader
import dev.kaorukajihara.shiodoki.ui.components.SectionTitle
import dev.kaorukajihara.shiodoki.ui.components.SyncIndicator
import dev.kaorukajihara.shiodoki.ui.theme.ShiodokiColors

/**
 * Design §5.6 and the "設定" artboard. Only the account section exists for now; the focus screen,
 * permission and test mode sections come with steps 6 and 7.
 */
@Composable
fun SettingsScreen(viewModel: SettingsViewModel, onSelectTab: (MainTab) -> Unit) {
  val account by viewModel.account.collectAsStateWithLifecycle()
  val syncStatus by viewModel.syncStatus.collectAsStateWithLifecycle()
  var confirmSignOut by rememberSaveable { mutableStateOf(false) }

  Scaffold(
    topBar = { ScreenHeader("設定") },
    bottomBar = { MainBottomBar(MainTab.SETTINGS, onSelectTab) },
  ) { padding ->
    Column(
      modifier = Modifier
        .fillMaxSize()
        .padding(padding)
        .verticalScroll(rememberScrollState())
        .padding(start = 24.dp, end = 24.dp, bottom = 28.dp),
      verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
      SectionTitle("アカウント")
      Row(
        modifier = Modifier
          .fillMaxWidth()
          .background(ShiodokiColors.Surface, RoundedCornerShape(16.dp))
          .padding(start = 16.dp, end = 8.dp, top = 12.dp, bottom = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
      ) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
          Text(
            account?.email ?: "-",
            fontSize = 15.sp,
            color = ShiodokiColors.TextStrong,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
          )
          SyncIndicator(syncStatus, dotSize = 6)
        }
        TextButton(
          onClick = { confirmSignOut = true },
          shape = RoundedCornerShape(10.dp),
          colors = ButtonDefaults.textButtonColors(contentColor = ShiodokiColors.Danger),
          modifier = Modifier.height(48.dp),
        ) {
          Text("ログアウト", fontSize = 14.sp)
        }
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
