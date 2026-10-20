package dev.kaorukajihara.shiodoki.ui

import androidx.annotation.StringRes
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.res.booleanResource
import androidx.compose.ui.res.stringResource
import dev.kaorukajihara.shiodoki.R
import dev.kaorukajihara.shiodoki.data.SyncStatus
import dev.kaorukajihara.shiodoki.model.MAX_MEMO_LENGTH
import dev.kaorukajihara.shiodoki.model.MAX_NAME_LENGTH
import dev.kaorukajihara.shiodoki.model.Priority
import dev.kaorukajihara.shiodoki.model.TaskInputError
import java.time.format.DateTimeFormatter
import java.util.Locale

/** String resources for model and data values, so those layers stay free of Android resources. */

@get:StringRes
val Priority.labelRes: Int
  get() = when (this) {
    Priority.NOW -> R.string.priority_now
    Priority.ROUTINE -> R.string.priority_routine
    Priority.SOONER -> R.string.priority_sooner
    Priority.ANYTIME -> R.string.priority_anytime
    Priority.SOMEDAY -> R.string.priority_someday
    Priority.BREAK -> R.string.priority_break
  }

@get:StringRes
val SyncStatus.labelRes: Int
  get() = when (this) {
    SyncStatus.SYNCED -> R.string.sync_synced
    SyncStatus.PENDING -> R.string.sync_pending
    SyncStatus.OFFLINE -> R.string.sync_offline
  }

@Composable
fun TaskInputError.message(): String = when (this) {
  TaskInputError.NAME_EMPTY -> stringResource(R.string.validation_name_empty)
  TaskInputError.NAME_TOO_LONG -> stringResource(R.string.validation_name_too_long, MAX_NAME_LENGTH)
  TaskInputError.MEMO_TOO_LONG -> stringResource(R.string.validation_memo_too_long, MAX_MEMO_LENGTH)
}

/**
 * A formatter for "Oct 9" / "10-09" (glossary Q-3) from the pattern in the resources of the
 * current language. [suffix] adds more fields, such as " HH:mm".
 */
@Composable
fun rememberDateFormatter(suffix: String = ""): DateTimeFormatter {
  val pattern = stringResource(R.string.date_pattern_short) + suffix
  // Only the English pattern has month names. Formatting with the device locale would print
  // them in that language (for example French) next to English text, so fix it to English.
  return remember(pattern) { DateTimeFormatter.ofPattern(pattern, Locale.US) }
}

/** The key as shown in the UI, the same in every language: SOONER shows as SOON (stored as SOONER). */
val Priority.shortName: String
  get() = if (this == Priority.SOONER) "SOON" else name

/**
 * Group heading "NOW  今すぐ". English shows only the key ("NOW"), since "NOW  Now" repeats it
 * (glossary Q-2).
 */
@Composable
fun priorityHeading(priority: Priority): String =
  if (booleanResource(R.bool.show_priority_label)) {
    "${priority.shortName}  ${stringResource(priority.labelRes)}"
  } else {
    priority.shortName
  }
