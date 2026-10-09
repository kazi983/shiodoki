package dev.kaorukajihara.shiodoki.focus

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings

/** The permissions the focus screen needs, in the order they are explained (design §6.7). */
enum class FocusPermission(val title: String, val reason: String) {
  OVERLAY("他のアプリの上に重ねて表示", "ロック解除時にフォーカス画面を出すため"),
  NOTIFICATIONS("通知", "常駐していることを知らせるため"),
  BATTERY("電池の最適化の対象外", "OS に止められないようにするため"),
  ;

  fun isGranted(context: Context): Boolean = when (this) {
    OVERLAY -> Settings.canDrawOverlays(context)
    NOTIFICATIONS ->
      Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
        context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) ==
        PackageManager.PERMISSION_GRANTED
    BATTERY ->
      context.getSystemService(PowerManager::class.java)
        .isIgnoringBatteryOptimizations(context.packageName)
  }

  /**
   * The system screen where the user grants it. Notifications are first asked with the runtime
   * dialog; this screen is the fallback once the dialog no longer appears.
   */
  fun settingsIntent(context: Context): Intent {
    val pkg = Uri.parse("package:${context.packageName}")
    return when (this) {
      OVERLAY -> Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, pkg)
      NOTIFICATIONS -> Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
        .putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
      BATTERY -> Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, pkg)
    }
  }
}
