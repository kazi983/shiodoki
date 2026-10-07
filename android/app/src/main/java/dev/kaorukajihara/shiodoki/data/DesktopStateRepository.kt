package dev.kaorukajihara.shiodoki.data

import dev.kaorukajihara.shiodoki.model.DesktopState
import kotlinx.coroutines.flow.StateFlow

/** The latest `state/desktop` document; [state] is null when the document does not exist. */
data class DesktopStateSnapshot(val state: DesktopState?)

/** The PC's status written by the desktop app (design §4.2). Read only. */
interface DesktopStateRepository {
  /** null until the first snapshot arrives (or while signed out). */
  val snapshot: StateFlow<DesktopStateSnapshot?>
}
