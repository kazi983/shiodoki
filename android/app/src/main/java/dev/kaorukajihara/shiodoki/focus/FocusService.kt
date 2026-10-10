package dev.kaorukajihara.shiodoki.focus

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleService
import androidx.lifecycle.lifecycleScope
import dev.kaorukajihara.shiodoki.MainActivity
import dev.kaorukajihara.shiodoki.R
import dev.kaorukajihara.shiodoki.ShiodokiApp
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.launch

/**
 * Foreground service that waits for unlocks (design §6.1, §6.5). `USER_PRESENT` and `SCREEN_OFF`
 * are only delivered to receivers registered at runtime, which is why a service must stay alive.
 */
class FocusService : LifecycleService() {
  private val container by lazy { (application as ShiodokiApp).container }
  private val controller by lazy { container.focusController }

  private val screenReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
      Log.i(TAG, "${intent.action} in state ${controller.state.value}")
      when (intent.action) {
        Intent.ACTION_USER_PRESENT -> {
          controller.onUnlock()
          // The overlay permission may have changed since the last update.
          updateNotification()
        }
        Intent.ACTION_SCREEN_OFF -> controller.onScreenOff()
      }
    }
  }

  override fun onCreate() {
    super.onCreate()
    createChannel()
    ServiceCompat.startForeground(
      this,
      NOTIFICATION_ID,
      buildNotification(),
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
        ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
      } else {
        0
      },
    )
    val filter = IntentFilter().apply {
      addAction(Intent.ACTION_USER_PRESENT)
      addAction(Intent.ACTION_SCREEN_OFF)
    }
    // Exported: USER_PRESENT comes from SystemUI, which runs under an app uid, so a not-exported
    // receiver never gets it (only SCREEN_OFF, sent by the system uid, would arrive). Both are
    // protected broadcasts, so other apps cannot send them.
    ContextCompat.registerReceiver(this, screenReceiver, filter, ContextCompat.RECEIVER_EXPORTED)
    // A session left by a killed process (design §6.6).
    controller.recover()
    lifecycleScope.launch {
      combine(controller.state, container.authManager.account) { _, _ -> }.collect { updateNotification() }
    }
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    super.onStartCommand(intent, flags, startId)
    // Restarted by the OS after being killed; onCreate then runs the recovery.
    return START_STICKY
  }

  override fun onDestroy() {
    unregisterReceiver(screenReceiver)
    // Without the receiver a running session would never see the screen go off.
    controller.stop()
    super.onDestroy()
  }

  private fun updateNotification() {
    getSystemService(NotificationManager::class.java).notify(NOTIFICATION_ID, buildNotification())
  }

  private fun buildNotification(): Notification {
    val text = when {
      container.authManager.account.value == null -> "ログインしてください"
      !FocusPermission.OVERLAY.isGranted(this) -> "権限が不足しています"
      else -> when (val s = controller.state.value) {
        is FocusState.Running ->
          "${s.taskName} 実行中（${s.startedAt.atZone(ZoneId.systemDefault()).format(TIME)}〜）"
        else -> "待機中"
      }
    }
    val openApp = PendingIntent.getActivity(
      this,
      0,
      Intent(this, MainActivity::class.java),
      PendingIntent.FLAG_IMMUTABLE,
    )
    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(R.drawable.ic_notification)
      .setContentTitle("フォーカス画面")
      .setContentText(text)
      .setContentIntent(openApp)
      .setOngoing(true)
      .setSilent(true)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .build()
  }

  private fun createChannel() {
    getSystemService(NotificationManager::class.java).createNotificationChannel(
      NotificationChannel(CHANNEL_ID, "フォーカス画面の待機", NotificationManager.IMPORTANCE_LOW),
    )
  }

  companion object {
    private const val TAG = "FocusService"
    private const val CHANNEL_ID = "focus_standby"
    private const val NOTIFICATION_ID = 1
    private val TIME = DateTimeFormatter.ofPattern("HH:mm")

    fun start(context: Context) {
      ContextCompat.startForegroundService(context, Intent(context, FocusService::class.java))
    }

    fun stop(context: Context) {
      context.stopService(Intent(context, FocusService::class.java))
    }
  }
}
