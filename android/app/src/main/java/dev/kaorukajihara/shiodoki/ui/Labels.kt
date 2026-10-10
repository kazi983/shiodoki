package dev.kaorukajihara.shiodoki.ui

import androidx.annotation.StringRes
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import dev.kaorukajihara.shiodoki.R
import dev.kaorukajihara.shiodoki.data.SyncStatus
import dev.kaorukajihara.shiodoki.model.MAX_MEMO_LENGTH
import dev.kaorukajihara.shiodoki.model.MAX_NAME_LENGTH
import dev.kaorukajihara.shiodoki.model.Priority
import dev.kaorukajihara.shiodoki.model.TaskInputError

/** String resources for model and data values, so those layers stay free of Android resources. */

@get:StringRes
val Priority.labelRes: Int
  get() = when (this) {
    Priority.NOW -> R.string.priority_now
    Priority.SOONER -> R.string.priority_sooner
    Priority.ANYTIME -> R.string.priority_anytime
    Priority.SOMEDAY -> R.string.priority_someday
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
