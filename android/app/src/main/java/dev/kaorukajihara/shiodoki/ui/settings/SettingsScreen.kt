package dev.kaorukajihara.shiodoki.ui.settings

import android.Manifest
import android.content.Context
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dev.kaorukajihara.shiodoki.focus.FocusPermission
import dev.kaorukajihara.shiodoki.ui.components.MainBottomBar
import dev.kaorukajihara.shiodoki.ui.components.MainTab
import dev.kaorukajihara.shiodoki.ui.components.ScreenHeader
import dev.kaorukajihara.shiodoki.ui.components.SectionTitle
import dev.kaorukajihara.shiodoki.ui.components.SyncIndicator
import dev.kaorukajihara.shiodoki.ui.theme.ShiodokiColors

/**
 * Design §5.6 and the "設定" artboard: the focus screen switch, the permissions it needs, and the
 * account. The test mode switch comes with step 7.
 */
@Composable
fun SettingsScreen(viewModel: SettingsViewModel, onSelectTab: (MainTab) -> Unit) {
  val context = LocalContext.current
  val account by viewModel.account.collectAsStateWithLifecycle()
  val syncStatus by viewModel.syncStatus.collectAsStateWithLifecycle()
  val focusEnabled by viewModel.focusEnabled.collectAsStateWithLifecycle()
  var confirmSignOut by rememberSaveable { mutableStateOf(false) }

  // Permissions are granted in other screens, so check again whenever this one comes back.
  var granted by remember { mutableStateOf(grantedPermissions(context)) }
  LifecycleResumeEffect(Unit) {
    granted = grantedPermissions(context)
    onPauseOrDispose {}
  }
  val notificationLauncher = rememberLauncherForActivityResult(
    ActivityResultContracts.RequestPermission(),
  ) { ok ->
    // The dialog no longer appears after two denials; send the user to the system screen.
    if (!ok) context.startActivity(FocusPermission.NOTIFICATIONS.settingsIntent(context))
    granted = grantedPermissions(context)
  }
  val request: (FocusPermission) -> Unit = { permission ->
    if (permission == FocusPermission.NOTIFICATIONS && Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      notificationLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
    } else {
      context.startActivity(permission.settingsIntent(context))
    }
  }

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
      verticalArrangement = Arrangement.spacedBy(28.dp),
    ) {
      Section("フォーカス画面") {
        Row(
          modifier = Modifier.padding(horizontal = 16.dp, vertical = 14.dp),
          verticalAlignment = Alignment.CenterVertically,
          horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
          Column(Modifier.weight(1f)) {
            Text("ロック解除のたびに表示", fontSize = 15.sp, color = ShiodokiColors.TextStrong)
            Text("「今から何をやる？」を全画面で聞きます", fontSize = 12.sp, color = ShiodokiColors.TextMuted)
          }
          Switch(
            checked = focusEnabled == true,
            enabled = focusEnabled != null,
            onCheckedChange = { on ->
              viewModel.setFocusEnabled(on)
              // Design §6.7: turning on starts the guide with the first missing permission.
              if (on) FocusPermission.entries.firstOrNull { it !in granted }?.let(request)
            },
            colors = SwitchDefaults.colors(
              checkedTrackColor = ShiodokiColors.Accent,
              checkedThumbColor = ShiodokiColors.OnAccent,
              uncheckedTrackColor = ShiodokiColors.NavIndicator,
              uncheckedThumbColor = ShiodokiColors.Ended,
              uncheckedBorderColor = ShiodokiColors.OutlineInactive,
            ),
          )
        }
      }

      Section("必要な権限") {
        FocusPermission.entries.forEachIndexed { index, permission ->
          if (index > 0) HorizontalDivider(color = ShiodokiColors.Divider)
          PermissionRow(permission, permission in granted, onRequest = { request(permission) })
        }
      }

      Section("アカウント") {
        Row(
          modifier = Modifier.padding(start = 16.dp, end = 8.dp, top = 12.dp, bottom = 12.dp),
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

private fun grantedPermissions(context: Context): Set<FocusPermission> =
  FocusPermission.entries.filter { it.isGranted(context) }.toSet()

/** A section title over a rounded card. */
@Composable
private fun Section(title: String, content: @Composable () -> Unit) {
  Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
    SectionTitle(title)
    Column(
      Modifier
        .fillMaxWidth()
        .background(ShiodokiColors.Surface, RoundedCornerShape(16.dp)),
    ) {
      content()
    }
  }
}

@Composable
private fun PermissionRow(permission: FocusPermission, granted: Boolean, onRequest: () -> Unit) {
  Row(
    modifier = Modifier
      .heightIn(min = 64.dp)
      .padding(start = 16.dp, end = 12.dp, top = 10.dp, bottom = 10.dp),
    verticalAlignment = Alignment.CenterVertically,
    horizontalArrangement = Arrangement.spacedBy(12.dp),
  ) {
    Column(Modifier.weight(1f)) {
      Text(permission.title, fontSize = 15.sp, color = ShiodokiColors.TextStrong)
      Text(permission.reason, fontSize = 12.sp, color = ShiodokiColors.TextMuted)
    }
    if (granted) {
      Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        Icon(Icons.Filled.Check, contentDescription = null, tint = GrantedText, modifier = Modifier.size(14.dp))
        Text("許可済み", fontSize = 12.sp, color = GrantedText)
      }
    } else {
      OutlinedButton(
        onClick = onRequest,
        shape = CircleShape,
        border = BorderStroke(1.dp, ShiodokiColors.Pending),
        colors = ButtonDefaults.outlinedButtonColors(contentColor = MissingText),
        modifier = Modifier.height(40.dp),
      ) {
        Icon(Icons.Filled.Warning, contentDescription = null, modifier = Modifier.size(14.dp))
        Text("設定する", fontSize = 13.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(start = 6.dp))
      }
    }
  }
}

/** "許可済み" and "設定する" colors of the "設定" artboard. */
private val GrantedText = Color(0xFF7FE0BD)
private val MissingText = Color(0xFFFBE3A0)
