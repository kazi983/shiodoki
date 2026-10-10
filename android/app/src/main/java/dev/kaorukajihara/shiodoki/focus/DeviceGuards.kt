package dev.kaorukajihara.shiodoki.focus

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioManager
import android.util.Log

/**
 * Whether the phone is in a call, ringing or sounding an alarm (M-15, design §6.3). Uses only
 * `AudioManager`, so no extra permission is needed.
 */
class DeviceGuards(context: Context) {
  private val audio = context.getSystemService(AudioManager::class.java)

  fun isBusy(): Boolean {
    val inCall = audio.mode in CALL_MODES
    val alarm = audio.activePlaybackConfigurations.any {
      it.audioAttributes.usage == AudioAttributes.USAGE_ALARM
    }
    if (inCall || alarm) Log.i(TAG, "Busy: audio mode=${audio.mode} alarm=$alarm")
    return inCall || alarm
  }

  private companion object {
    const val TAG = "DeviceGuards"
    val CALL_MODES = setOf(
      AudioManager.MODE_IN_CALL,
      AudioManager.MODE_IN_COMMUNICATION,
      AudioManager.MODE_RINGTONE,
    )
  }
}
