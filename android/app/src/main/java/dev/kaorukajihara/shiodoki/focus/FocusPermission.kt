package dev.kaorukajihara.shiodoki.focus

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.annotation.StringRes
import dev.kaorukajihara.shiodoki.R

/** The permissions the focus screen needs, in the order they are explained (design §6.7). */
enum class FocusPermission(@StringRes val title: Int, @StringRes val reason: Int) {
  OVERLAY(R.string.permission_overlay, R.string.permission_overlay_reason),
  NOTIFICATIONS(R.string.permission_notifications, R.string.permission_notifications_reason),
  BATTERY(R.string.permission_battery, R.string.permission_battery_reason),
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
