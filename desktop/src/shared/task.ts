/**
 * Task domain model shared by main and renderer.
 * Field names follow the Firestore schema in docs/requirements.md §5.1.
 */

import { t } from "./i18n";

export const PRIORITIES = ["NOW", "SOONER", "ANYTIME", "SOMEDAY"] as const;

export type Priority = (typeof PRIORITIES)[number];

export const DEFAULT_PRIORITY: Priority = "NOW";

/**
 * dot: group marker in the picker; chip: label colors in the management table.
 * Labels are UI text: t().priority.
 */
export const PRIORITY_META: Record<Priority, { dot: string; chipFg: string; chipBg: string }> = {
  NOW: { dot: "#ff8a4c", chipFg: "#ffd2b8", chipBg: "#3a2418" },
  SOONER: { dot: "#f5c451", chipFg: "#fbe3a0", chipBg: "#3a3118" },
  ANYTIME: { dot: "#4fd1a5", chipFg: "#b6f0db", chipBg: "#16342b" },
  SOMEDAY: { dot: "#8b93a7", chipFg: "#c9d1e6", chipBg: "#262e42" },
};

export type UpdatedBy = "desktop" | "android" | "migration";

export interface Task {
  id: string;
  name: string;
  memo: string;
  priority: Priority;
  completed: boolean;
  /** ISO 8601 (UTC) */
  completedAt: string | null;
  deleted: boolean;
  totalMinutes: number;
  sessionCount: number;
  /** ISO 8601 (UTC) */
  createdAt: string;
  /** ISO 8601 (UTC) */
  updatedAt: string;
  updatedBy: UpdatedBy;
}

/** Fields a client may change on an existing task (updatedAt/updatedBy are set by the repository). */
export type TaskPatch = Partial<Pick<Task, "name" | "memo" | "priority" | "completed" | "completedAt" | "deleted">>;

export interface TaskInput {
  name: string;
  priority: Priority;
  memo: string;
}

export function isPriority(value: unknown): value is Priority {
  return typeof value === "string" && (PRIORITIES as readonly string[]).includes(value);
}

export const MAX_NAME_LENGTH = 200;
export const MAX_MEMO_LENGTH = 5000;

/**
 * Normalize and validate user input for a task.
 * Throws an Error with a user-facing message when invalid.
 */
export function normalizeTaskInput(input: TaskInput): TaskInput {
  const name = input.name.trim();
  const memo = input.memo.trim();

  const text = t().validation;
  if (!name) throw new Error(text.nameRequired);
  if (name.length > MAX_NAME_LENGTH) throw new Error(text.nameTooLong(MAX_NAME_LENGTH));
  if (memo.length > MAX_MEMO_LENGTH) throw new Error(text.memoTooLong(MAX_MEMO_LENGTH));
  if (!isPriority(input.priority)) throw new Error(text.invalidPriority);

  return { name, memo, priority: input.priority };
}

/** Sort: priority order (NOW first), then oldest first. */
export function compareTasks(a: Task, b: Task): number {
  const byPriority = PRIORITIES.indexOf(a.priority) - PRIORITIES.indexOf(b.priority);
  if (byPriority !== 0) return byPriority;
  return a.createdAt.localeCompare(b.createdAt);
}

/** Sort for the management list: incomplete tasks first, then compareTasks. */
export function compareTasksForManagement(a: Task, b: Task): number {
  if (a.completed !== b.completed) return a.completed ? 1 : -1;
  return compareTasks(a, b);
}

/** Compact form for lists: "2h 5m", "45m", `zero` ("—") for no time yet. Same in every language. */
export function formatDuration(totalMinutes: number, zero = "—"): string {
  if (totalMinutes <= 0) return zero;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}
