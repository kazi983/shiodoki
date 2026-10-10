package dev.kaorukajihara.shiodoki.focus

import android.content.Context
import android.content.Intent

/**
 * Starts [FocusActivity] from the background, which Android allows because the app holds the
 * overlay permission (design §6.4; `canPrompt` checks it first).
 */
class ActivityFocusScreen(private val context: Context) : FocusScreen {
  override fun show() {
    context.startActivity(
      Intent(context, FocusActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
    )
  }

  /** Nothing to do: [FocusActivity] closes itself as soon as the state leaves Prompting. */
  override fun dismiss() = Unit
}
