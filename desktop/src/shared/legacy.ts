/**
 * Import of the v1 (Python/Tkinter) tasks.json file.
 */

import { isPriority, type Task } from "./task";

export interface LegacyTask {
  id?: string;
  name: string;
  memo?: string;
  completed?: boolean;
  priority?: string;
  total_minutes?: number;
  completed_sessions?: number;
  created_at?: string;
  last_selected?: boolean;
  deleted?: boolean;
}

/**
 * Location of the v1 data file, mirroring app/config/paths.py:
 *   Windows: %APPDATA%/30min-task-timer/tasks.json
 *   Linux:   $XDG_CONFIG_HOME/30min-task-timer/tasks.json, else ~/.30min-task-timer/tasks.json
 */
export function legacyDataFile(
  platform: string,
  env: Record<string, string | undefined>,
  home: string,
  testMode: boolean,
): string {
  const file = testMode ? "tasks_test.json" : "tasks.json";
  const sep = platform === "win32" ? "\\" : "/";
  if (platform === "win32" && env.APPDATA) return [env.APPDATA, "30min-task-timer", file].join(sep);
  if (env.XDG_CONFIG_HOME) return [env.XDG_CONFIG_HOME, "30min-task-timer", file].join(sep);
  return [home, ".30min-task-timer", file].join(sep);
}

function toNonNegativeInt(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
}

/**
 * Convert v1 tasks. Deleted tasks are dropped, unknown priorities become
 * SOMEDAY (requirements §5.5), and the last-selected task id is returned
 * separately since v2 stores it in preferences.
 */
export function convertLegacyTasks(
  raw: unknown,
  now: Date,
  newId: () => string,
): { tasks: Task[]; lastSelectedTaskId: string | null } {
  if (!Array.isArray(raw)) throw new Error("tasks.json の形式が正しくありません");

  const nowIso = now.toISOString();
  const tasks: Task[] = [];
  let lastSelectedTaskId: string | null = null;

  for (const item of raw as LegacyTask[]) {
    if (!item || typeof item.name !== "string" || !item.name.trim() || item.deleted) continue;

    const created = item.created_at ? new Date(item.created_at) : now;
    const createdAt = Number.isNaN(created.getTime()) ? nowIso : created.toISOString();
    const completed = item.completed === true;

    const task: Task = {
      id: typeof item.id === "string" && item.id ? item.id : newId(),
      name: item.name.trim().slice(0, 200),
      memo: typeof item.memo === "string" ? item.memo.slice(0, 5000) : "",
      priority: isPriority(item.priority) ? item.priority : "SOMEDAY",
      completed,
      completedAt: completed ? nowIso : null,
      deleted: false,
      totalMinutes: toNonNegativeInt(item.total_minutes),
      sessionCount: toNonNegativeInt(item.completed_sessions),
      createdAt,
      updatedAt: nowIso,
      updatedBy: "migration",
    };
    tasks.push(task);
    if (item.last_selected) lastSelectedTaskId = task.id;
  }

  return { tasks, lastSelectedTaskId };
}
