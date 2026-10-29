import { existsSync, renameSync } from "node:fs";
import type { SessionRecord } from "@shared/session";
import type { Task } from "@shared/task";
import { JsonFileTaskRepository } from "./taskRepository";

export interface LocalData {
  tasks: Task[];
  /** Every session, also those of deleted tasks: the history keeps them by their task name. */
  sessions: SessionRecord[];
  lastSelectedTaskId: string | null;
  /** Where the data came from, for the confirmation dialog. */
  source: string;
  /** Called after a successful upload so the data is not offered again. */
  markMigrated(): void;
}

/**
 * Tasks and sessions on this PC that can be copied to Firestore on first sign-in
 * (requirements D-07): the local-mode store, if it exists. Deleted tasks are skipped.
 */
export async function findLocalData(storeFile: string): Promise<LocalData | null> {
  if (!existsSync(storeFile)) return null;
  const repo = new JsonFileTaskRepository(storeFile);
  const tasks = (await repo.listTasks()).filter((t) => !t.deleted);
  if (tasks.length === 0) return null;
  const prefs = await repo.getPreferences();
  return {
    tasks,
    sessions: await repo.listSessions(),
    lastSelectedTaskId: prefs.lastSelectedTaskId,
    source: storeFile,
    markMigrated: () => renameSync(storeFile, `${storeFile}.migrated`),
  };
}
