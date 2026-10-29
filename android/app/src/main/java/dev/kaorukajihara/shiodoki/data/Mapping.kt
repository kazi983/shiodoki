package dev.kaorukajihara.shiodoki.data

import com.google.firebase.Timestamp
import com.google.firebase.firestore.FieldValue
import dev.kaorukajihara.shiodoki.crypto.FieldCipher
import dev.kaorukajihara.shiodoki.crypto.WrappedKeys
import dev.kaorukajihara.shiodoki.crypto.sealMemo
import dev.kaorukajihara.shiodoki.model.DesktopState
import dev.kaorukajihara.shiodoki.model.DesktopStatus
import dev.kaorukajihara.shiodoki.model.FinishedSession
import dev.kaorukajihara.shiodoki.model.Priority
import dev.kaorukajihara.shiodoki.model.Task
import dev.kaorukajihara.shiodoki.model.TaskInput
import dev.kaorukajihara.shiodoki.model.TaskPatch
import java.time.Instant
import java.util.Base64

/*
 * Conversion between models and Firestore documents. Field names follow requirements §5.1 and
 * firebase/firestore.rules; behavior mirrors desktop/src/renderer/data/mapping.ts.
 *
 * Task names, memos and session / desktop-state task names are end-to-end encrypted with the [FieldCipher]
 * (docs/e2ee/design.md §2); the 200 / 5000 character limits apply to the plain text.
 */

const val UPDATED_BY = "android"

/**
 * A full document for a new task (design §4.3). `createdAt` is the device time, like desktop. [sortOrder] puts it
 * at the end of its priority ([dev.kaorukajihara.shiodoki.model.endSortOrder]).
 */
fun newTaskDoc(input: TaskInput, now: Timestamp, sortOrder: Double, cipher: FieldCipher): Map<String, Any?> = mapOf(
  "name" to cipher.seal(input.name),
  "memo" to cipher.sealMemo(input.memo),
  "priority" to input.priority.name,
  "completed" to false,
  "completedAt" to null,
  "deleted" to false,
  "totalMinutes" to 0L,
  "sessionCount" to 0L,
  "createdAt" to now,
  "updatedAt" to FieldValue.serverTimestamp(),
  "updatedBy" to UPDATED_BY,
  "sortOrder" to sortOrder,
)

/** Only the changed fields, plus `updatedAt` / `updatedBy` (rules require both on every write). */
fun patchToDoc(patch: TaskPatch, now: Timestamp, cipher: FieldCipher): Map<String, Any?> = buildMap {
  patch.name?.let { put("name", cipher.seal(it)) }
  patch.memo?.let { put("memo", cipher.sealMemo(it)) }
  patch.priority?.let { put("priority", it.name) }
  patch.completed?.let {
    put("completed", it)
    put("completedAt", if (it) now else null)
  }
  patch.deleted?.let { put("deleted", it) }
  patch.sortOrder?.let { put("sortOrder", it) }
  put("updatedAt", FieldValue.serverTimestamp())
  put("updatedBy", UPDATED_BY)
}

/** `sessions/{id}` of a phone session (design §4.4); the rules cap the name and device lengths. */
fun sessionToDoc(s: FinishedSession, device: String, cipher: FieldCipher): Map<String, Any?> = mapOf(
  "taskId" to s.taskId,
  "taskName" to cipher.seal(s.taskName.take(MAX_SESSION_TASK_NAME)),
  "startedAt" to s.startedAt.toTimestamp(),
  "endedAt" to s.endedAt.toTimestamp(),
  "elapsedMinutes" to s.elapsedMinutes,
  "endReason" to s.endReason.value,
  "device" to device.take(MAX_DEVICE_LENGTH),
)

/** Adds a session to its task's counters, in the same batch as [sessionToDoc]. */
fun sessionCountersDoc(s: FinishedSession): Map<String, Any?> = mapOf(
  "totalMinutes" to FieldValue.increment(s.elapsedMinutes),
  "sessionCount" to FieldValue.increment(1),
  "updatedAt" to FieldValue.serverTimestamp(),
  "updatedBy" to UPDATED_BY,
)

private const val MAX_SESSION_TASK_NAME = 200
private const val MAX_DEVICE_LENGTH = 100

private fun Instant.toTimestamp() = Timestamp(epochSecond, nano)

/**
 * Reads a task document. Unexpected types fall back to defaults (like the desktop `docToTask`).
 * Pending server timestamps must be read with `ServerTimestampBehavior.ESTIMATE` by the caller,
 * so they are Timestamps here.
 */
fun docToTask(id: String, d: Map<String, Any?>, cipher: FieldCipher, now: Instant = Instant.now()): Task = Task(
  id = id,
  name = cipher.open(d["name"] as? String ?: ""),
  memo = cipher.open(d["memo"] as? String ?: ""),
  priority = Priority.fromValue(d["priority"]) ?: Priority.SOMEDAY,
  completed = d["completed"] == true,
  completedAt = (d["completedAt"] as? Timestamp)?.toInstant(),
  deleted = d["deleted"] == true,
  totalMinutes = (d["totalMinutes"] as? Number)?.toLong() ?: 0L,
  sessionCount = (d["sessionCount"] as? Number)?.toLong() ?: 0L,
  createdAt = (d["createdAt"] as? Timestamp)?.toInstant() ?: now,
  updatedAt = (d["updatedAt"] as? Timestamp)?.toInstant() ?: now,
  // Absent on tasks written before it existed (requirements §5.1).
  sortOrder = (d["sortOrder"] as? Number)?.toDouble()?.takeIf { it.isFinite() },
)

/**
 * Reads `state/desktop`. An unknown status makes the whole document unusable, so it reads as
 * missing (null); other unexpected values fall back to null / "".
 */
fun docToDesktopState(d: Map<String, Any?>, cipher: FieldCipher): DesktopState? {
  val status = DesktopStatus.fromValue(d["status"]) ?: return null
  return DesktopState(
    status = status,
    currentTaskId = d["currentTaskId"] as? String,
    currentTaskName = (d["currentTaskName"] as? String)?.let(cipher::open),
    startedAt = (d["startedAt"] as? Timestamp)?.toInstant(),
    nextPromptAt = (d["nextPromptAt"] as? Timestamp)?.toInstant(),
    heartbeatAt = (d["heartbeatAt"] as? Timestamp)?.toInstant(),
    device = d["device"] as? String ?: "",
  )
}

/** Reads `state/keys` (docs/e2ee/design.md §4.2). Null when the document has another shape (a newer version). */
fun docToWrappedKeys(d: Map<String, Any?>): WrappedKeys? {
  if ((d["v"] as? Number)?.toInt() != 1) return null
  val passphrase = d["passphrase"] as? Map<*, *> ?: return null
  val recovery = d["recovery"] as? Map<*, *> ?: return null
  val base64 = Base64.getDecoder()
  return WrappedKeys(
    passphraseSalt = base64.decode(passphrase["salt"] as? String ?: return null),
    iterations = (passphrase["iterations"] as? Number)?.toInt() ?: return null,
    passphraseWrappedKey = passphrase["wrappedKey"] as? String ?: return null,
    recoverySalt = base64.decode(recovery["salt"] as? String ?: return null),
    recoveryWrappedKey = recovery["wrappedKey"] as? String ?: return null,
  )
}
