/**
 * Types shared by the main process and the hidden "data" window that runs
 * the Firebase SDK (Firestore offline persistence needs IndexedDB, which
 * only exists in a browser context).
 */

import type { DesktopStatus } from "./desktopState";
import type { SessionRecord } from "./session";
import type { Task, TaskPatch } from "./task";

/** local: no Firebase (TIMER_LOCAL=1). The others come from Firestore snapshot metadata. */
export type SyncStatus = "local" | "synced" | "pending" | "offline";

export interface SyncInfo {
  status: SyncStatus;
  email: string | null;
}

export interface PreferencesData {
  lastSelectedTaskId: string | null;
  nextTaskId: string | null;
}

/** Mirrors users/{uid}/state/desktop (heartbeatAt is set by the server). */
export interface DesktopStateData {
  status: DesktopStatus;
  currentTaskId: string | null;
  currentTaskName: string | null;
  /** ISO 8601 */
  startedAt: string | null;
  /** ISO 8601 */
  nextPromptAt: string | null;
  device: string;
}

export interface DataWindowConfig {
  firebase: Record<string, string>;
  /** Connect to the local emulators instead of the real project. */
  emulator: boolean;
  device: string;
}

export type DataRequest =
  | { op: "signIn"; idToken: string }
  | { op: "signOut" }
  | { op: "createTask"; task: Task }
  | { op: "updateTask"; id: string; patch: TaskPatch }
  | { op: "recordSession"; session: SessionRecord }
  | { op: "setPreferences"; patch: Partial<PreferencesData> }
  | { op: "setDesktopState"; state: DesktopStateData }
  | { op: "countRemoteTasks" }
  | { op: "importTasks"; tasks: Task[]; preferences: Partial<PreferencesData> }
  | { op: "flush"; timeoutMs: number };

export interface DataRequestMessage {
  id: number;
  request: DataRequest;
}

export interface DataResponseMessage {
  id: number;
  ok: boolean;
  result?: unknown;
  error?: string;
}

export type DataEvent =
  | { type: "ready" }
  | { type: "auth"; uid: string | null; email: string | null }
  | { type: "tasks"; tasks: Task[]; status: Exclude<SyncStatus, "local"> }
  | { type: "preferences"; preferences: PreferencesData }
  | { type: "error"; message: string };

export const DATA_IPC = {
  request: "data:request",
  response: "data:response",
  event: "data:event",
  getConfig: "data:getConfig",
} as const;

/** API the data preload exposes to the hidden data window as window.dataBridge. */
export interface DataBridgeApi {
  getConfig(): Promise<DataWindowConfig>;
  onRequest(listener: (message: DataRequestMessage) => void): void;
  respond(message: DataResponseMessage): void;
  emit(event: DataEvent): void;
}
