import { existsSync, readFileSync, renameSync } from "node:fs";
import { convertLegacyTasks } from "@shared/legacy";
import type { Task } from "@shared/task";
import { JsonFileTaskRepository } from "./taskRepository";

export interface LocalData {
  tasks: Task[];
  lastSelectedTaskId: string | null;
  /** Where the data came from, for the confirmation dialog. */
  source: string;
  /** Called after a successful upload so the data is not offered again. */
  markMigrated(): void;
}

/**
 * Tasks on this PC that can be copied to Firestore on first sign-in
 * (requirements D-07): the v2 local store if it exists (P2 / local mode),
 * otherwise the v1 tasks.json. Deleted tasks are skipped.
 */
export async function findLocalData(
  storeFile: string,
  legacyFile: string,
  newId: () => string,
  now: Date = new Date(),
): Promise<LocalData | null> {
  if (existsSync(storeFile)) {
    const repo = new JsonFileTaskRepository(storeFile);
    const tasks = (await repo.listTasks()).filter((t) => !t.deleted);
    if (tasks.length === 0) return null;
    const prefs = await repo.getPreferences();
    return {
      tasks,
      lastSelectedTaskId: prefs.lastSelectedTaskId,
      source: storeFile,
      markMigrated: () => renameSync(storeFile, `${storeFile}.migrated`),
    };
  }
  if (existsSync(legacyFile)) {
    const { tasks, lastSelectedTaskId } = convertLegacyTasks(JSON.parse(readFileSync(legacyFile, "utf8")), now, newId);
    if (tasks.length === 0) return null;
    // The v1 file is left untouched: v1 may still be in use.
    return { tasks, lastSelectedTaskId, source: legacyFile, markMigrated: () => {} };
  }
  return null;
}
