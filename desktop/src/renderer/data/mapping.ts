/**
 * Conversion between app models (ISO 8601 strings) and Firestore documents
 * (Timestamps). Field names follow requirements §5.1 and firestore.rules.
 */

import { Timestamp, serverTimestamp, type DocumentData, type FieldValue } from "firebase/firestore";
import type { SessionRecord } from "@shared/session";
import type { DesktopStateData, KeysData, PreferencesData } from "@shared/sync";
import { isPriority, type Task, type TaskPatch, type UpdatedBy } from "@shared/task";

function ts(iso: string): Timestamp {
  return Timestamp.fromDate(new Date(iso));
}

function tsOrNull(iso: string | null): Timestamp | null {
  return iso ? ts(iso) : null;
}

function iso(value: unknown, fallback: string): string {
  return value instanceof Timestamp ? value.toDate().toISOString() : fallback;
}

export function taskToDoc(task: Task, updatedBy: UpdatedBy = "desktop"): Record<string, unknown> {
  return {
    // Optional in the rules: tasks written before it existed have none.
    ...(task.sortOrder === undefined ? {} : { sortOrder: task.sortOrder }),
    name: task.name,
    memo: task.memo,
    priority: task.priority,
    completed: task.completed,
    completedAt: tsOrNull(task.completedAt),
    deleted: task.deleted,
    totalMinutes: task.totalMinutes,
    sessionCount: task.sessionCount,
    createdAt: ts(task.createdAt),
    updatedAt: serverTimestamp(),
    updatedBy,
  };
}

export function patchToDoc(patch: TaskPatch): Record<string, unknown> {
  const doc: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    doc[key] = key === "completedAt" ? tsOrNull(value as string | null) : value;
  }
  doc.updatedAt = serverTimestamp();
  doc.updatedBy = "desktop";
  return doc;
}

/**
 * Read a task document. Pending serverTimestamp() values are read with
 * serverTimestamps: "estimate" by the caller, so they are Timestamps here.
 */
export function docToTask(id: string, d: DocumentData): Task {
  const now = new Date().toISOString();
  const updatedBy: UpdatedBy = d.updatedBy === "android" || d.updatedBy === "migration" ? d.updatedBy : "desktop";
  return {
    id,
    name: typeof d.name === "string" ? d.name : "",
    memo: typeof d.memo === "string" ? d.memo : "",
    priority: isPriority(d.priority) ? d.priority : "SOMEDAY",
    completed: d.completed === true,
    completedAt: d.completedAt instanceof Timestamp ? d.completedAt.toDate().toISOString() : null,
    deleted: d.deleted === true,
    totalMinutes: typeof d.totalMinutes === "number" ? d.totalMinutes : 0,
    sessionCount: typeof d.sessionCount === "number" ? d.sessionCount : 0,
    createdAt: iso(d.createdAt, now),
    updatedAt: iso(d.updatedAt, now),
    updatedBy,
    ...(typeof d.sortOrder === "number" && Number.isFinite(d.sortOrder) ? { sortOrder: d.sortOrder } : {}),
  };
}

export function sessionToDoc(s: SessionRecord): Record<string, unknown> {
  return {
    taskId: s.taskId,
    // Ciphertext: cutting it would make it unreadable (the apps limit the plain text).
    taskName: s.taskName,
    startedAt: ts(s.startedAt),
    endedAt: ts(s.endedAt),
    elapsedMinutes: s.elapsedMinutes,
    endReason: s.endReason,
    device: s.device.slice(0, 100),
  };
}

export function docToSession(id: string, d: DocumentData): SessionRecord {
  const epoch = new Date(0).toISOString();
  return {
    id,
    taskId: typeof d.taskId === "string" ? d.taskId : "",
    taskName: typeof d.taskName === "string" ? d.taskName : "",
    startedAt: iso(d.startedAt, epoch),
    endedAt: iso(d.endedAt, epoch),
    elapsedMinutes: typeof d.elapsedMinutes === "number" ? d.elapsedMinutes : 0,
    endReason: d.endReason as SessionRecord["endReason"],
    device: typeof d.device === "string" ? d.device : "",
  };
}

export function desktopStateToDoc(s: DesktopStateData): Record<string, unknown | FieldValue> {
  return {
    status: s.status,
    currentTaskId: s.currentTaskId,
    currentTaskName: s.currentTaskName,
    startedAt: tsOrNull(s.startedAt),
    nextPromptAt: tsOrNull(s.nextPromptAt),
    heartbeatAt: serverTimestamp(),
    device: s.device.slice(0, 100),
  };
}

export function docToPreferences(d: DocumentData | undefined): PreferencesData {
  return {
    lastSelectedTaskId: typeof d?.lastSelectedTaskId === "string" ? d.lastSelectedTaskId : null,
    nextTaskId: typeof d?.nextTaskId === "string" ? d.nextTaskId : null,
  };
}

/** The rules guarantee the shape; only the fields the app knows are kept (updatedAt is dropped). */
export function docToKeys(d: DocumentData): KeysData {
  return {
    v: 1,
    passphrase: {
      kdf: "PBKDF2-SHA256",
      iterations: d.passphrase.iterations,
      salt: d.passphrase.salt,
      wrappedKey: d.passphrase.wrappedKey,
    },
    recovery: { kdf: "HKDF-SHA256", salt: d.recovery.salt, wrappedKey: d.recovery.wrappedKey },
  };
}
