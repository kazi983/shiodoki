package dev.kaorukajihara.shiodoki.data

import com.google.firebase.Timestamp
import com.google.firebase.firestore.FieldValue
import dev.kaorukajihara.shiodoki.model.Priority
import dev.kaorukajihara.shiodoki.model.Task
import dev.kaorukajihara.shiodoki.model.TaskInput
import dev.kaorukajihara.shiodoki.model.TaskPatch
import java.time.Instant

/*
 * Conversion between models and Firestore documents. Field names follow requirements §5.1 and
 * firebase/firestore.rules; behavior mirrors desktop/src/renderer/data/mapping.ts.
 */

const val UPDATED_BY = "android"

/** A full document for a new task (design §4.3). `createdAt` is the device time, like desktop. */
fun newTaskDoc(input: TaskInput, now: Timestamp): Map<String, Any?> = mapOf(
  "name" to input.name,
  "memo" to input.memo,
  "priority" to input.priority.name,
  "completed" to false,
  "completedAt" to null,
  "deleted" to false,
  "totalMinutes" to 0L,
  "sessionCount" to 0L,
  "createdAt" to now,
  "updatedAt" to FieldValue.serverTimestamp(),
  "updatedBy" to UPDATED_BY,
)

/** Only the changed fields, plus `updatedAt` / `updatedBy` (rules require both on every write). */
fun patchToDoc(patch: TaskPatch, now: Timestamp): Map<String, Any?> = buildMap {
  patch.name?.let { put("name", it) }
  patch.memo?.let { put("memo", it) }
  patch.priority?.let { put("priority", it.name) }
  patch.completed?.let {
    put("completed", it)
    put("completedAt", if (it) now else null)
  }
  patch.deleted?.let { put("deleted", it) }
  put("updatedAt", FieldValue.serverTimestamp())
  put("updatedBy", UPDATED_BY)
}

/**
 * Reads a task document. Unexpected types fall back to defaults (like the desktop `docToTask`).
 * Pending server timestamps must be read with `ServerTimestampBehavior.ESTIMATE` by the caller,
 * so they are Timestamps here.
 */
fun docToTask(id: String, d: Map<String, Any?>, now: Instant = Instant.now()): Task = Task(
  id = id,
  name = d["name"] as? String ?: "",
  memo = d["memo"] as? String ?: "",
  priority = Priority.fromValue(d["priority"]) ?: Priority.SOMEDAY,
  completed = d["completed"] == true,
  completedAt = (d["completedAt"] as? Timestamp)?.toInstant(),
  deleted = d["deleted"] == true,
  totalMinutes = (d["totalMinutes"] as? Number)?.toLong() ?: 0L,
  sessionCount = (d["sessionCount"] as? Number)?.toLong() ?: 0L,
  createdAt = (d["createdAt"] as? Timestamp)?.toInstant() ?: now,
  updatedAt = (d["updatedAt"] as? Timestamp)?.toInstant() ?: now,
)
