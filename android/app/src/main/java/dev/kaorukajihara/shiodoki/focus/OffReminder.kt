package dev.kaorukajihara.shiodoki.focus

import android.Manifest
import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.util.Log
import androidx.compose.ui.graphics.toArgb
import androidx.core.app.NotificationCompat
import dev.kaorukajihara.shiodoki.BuildConfig
import dev.kaorukajihara.shiodoki.MainActivity
import dev.kaorukajihara.shiodoki.R
import dev.kaorukajihara.shiodoki.ShiodokiApp
import dev.kaorukajihara.shiodoki.ui.theme.ShiodokiColors
import java.time.Duration
import java.time.LocalTime
import java.time.ZonedDateTime
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

/** The morning reminder while the feature is off (M-21) comes at this local time. */
val OFF_REMINDER_TIME: LocalTime = LocalTime.of(8, 0)

/**
 * When the next off reminder is due (design §6.10): the next 8:00 after [now], even when the
 * feature was turned off a minute before. The test mode reminds a minute later instead.
 */
fun nextOffReminderAt(now: ZonedDateTime, testMode: Boolean): ZonedDateTime {
  if (testMode) return now.plus(TEST_INTERVAL)
  val today = now.with(OFF_REMINDER_TIME).withSecond(0).withNano(0)
  return if (today.isAfter(now)) today else today.plusDays(1).with(OFF_REMINDER_TIME)
}

private val TEST_INTERVAL: Duration = Duration.ofMinutes(1)

/**
 * Wakes the app every morning while the focus feature is off (M-21, design §6.10). The service
 * does not run then, so an inexact alarm does the waking: no extra permission, a few minutes late
 * at most.
 */
object OffReminder {
  private const val TAG = "OffReminder"
  private const val CHANNEL_ID = "focus_off_reminder"
  private const val NOTIFICATION_ID = 3

  fun schedule(context: Context) {
    val at = nextOffReminderAt(ZonedDateTime.now(), testMode = BuildConfig.DEBUG)
    context.getSystemService(AlarmManager::class.java)
      .setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at.toInstant().toEpochMilli(), pendingIntent(context))
    Log.i(TAG, "Off reminder set for $at")
  }

  /** Feature turned on: no more alarms, and an old reminder goes away. */
  fun cancel(context: Context) {
    context.getSystemService(AlarmManager::class.java).cancel(pendingIntent(context))
    context.getSystemService(NotificationManager::class.java).cancel(NOTIFICATION_ID)
  }

  internal fun notify(context: Context) {
    if (context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
      return
    }
    val manager = context.getSystemService(NotificationManager::class.java)
    manager.createNotificationChannel(
      NotificationChannel(
        CHANNEL_ID,
        context.getString(R.string.notification_channel_off_reminder),
        NotificationManager.IMPORTANCE_DEFAULT,
      ),
    )
    val openSettings = PendingIntent.getActivity(
      context,
      0,
      Intent(context, MainActivity::class.java)
        .putExtra(MainActivity.EXTRA_OPEN_SETTINGS, true)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )
    val notification = NotificationCompat.Builder(context, CHANNEL_ID)
      .setSmallIcon(R.drawable.ic_notification)
      .setColor(ShiodokiColors.Accent.toArgb())
      .setContentTitle(context.getString(R.string.off_reminder_title))
      .setContentText(context.getString(R.string.off_reminder_text))
      .setContentIntent(openSettings)
      .setAutoCancel(true)
      .build()
    manager.notify(NOTIFICATION_ID, notification)
  }

  private fun pendingIntent(context: Context): PendingIntent = PendingIntent.getBroadcast(
    context,
    0,
    Intent(context, OffReminderReceiver::class.java),
    PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
  )
}

/** The off reminder's alarm. Checks again that it is still due, then sets the next one. */
class OffReminderReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val container = (context.applicationContext as ShiodokiApp).container
    // Reading DataStore suspends; goAsync keeps the receiver alive until it is done.
    val pending = goAsync()
    CoroutineScope(Dispatchers.Main).launch {
      try {
        val store = container.localStore
        if (!store.offReminderArmed.first() || store.focusEnabled.first()) return@launch
        if (container.authManager.account.value != null) OffReminder.notify(context)
        OffReminder.schedule(context)
      } finally {
        pending.finish()
      }
    }
  }
}
