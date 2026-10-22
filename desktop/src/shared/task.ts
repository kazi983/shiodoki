/**
 * Task domain model shared by main and renderer.
 * Field names follow the Firestore schema in docs/requirements.md §5.1.
 */

import { t } from "./i18n";

/**
 * Fixed priorities (requirements §5.5), in display order. The UI calls them categories (分類 /
 * Category); the field and the code keep the name priority.
 */
export const PRIORITIES = ["NOW", "ROUTINE", "SOONER", "ANYTIME", "SOMEDAY", "BREAK"] as const;

export type Priority = (typeof PRIORITIES)[number];

export const DEFAULT_PRIORITY: Priority = "NOW";

/**
 * shortName: the key as shown in the UI, the same in every language (SOONER shows as SOON; the
 * stored value stays SOONER). dot: group marker in the picker; chip: label colors in the
 * management table. Labels are UI text: t().priority.
 */
export const PRIORITY_META: Record<Priority, { shortName: string; dot: string; chipFg: string; chipBg: string }> = {
  NOW: { shortName: "NOW", dot: "#ff8a4c", chipFg: "#ffd2b8", chipBg: "#3a2418" },
  ROUTINE: { shortName: "ROUTINE", dot: "#7cc4ff", chipFg: "#cbe6ff", chipBg: "#162d42" },
  SOONER: { shortName: "SOON", dot: "#f5c451", chipFg: "#fbe3a0", chipBg: "#3a3118" },
  ANYTIME: { shortName: "ANYTIME", dot: "#4fd1a5", chipFg: "#b6f0db", chipBg: "#16342b" },
  SOMEDAY: { shortName: "SOMEDAY", dot: "#8b93a7", chipFg: "#c9d1e6", chipBg: "#262e42" },
  BREAK: { shortName: "BREAK", dot: "#c08cff", chipFg: "#e6d3ff", chipBg: "#2e2142" },
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
  /**
   * Position within its priority (requirements §5.1). Absent on tasks written before it existed: then the
   * creation time in epoch milliseconds stands in (see orderOf), which keeps their old order.
   */
  sortOrder?: number;
}

/** Fields a client may change on an existing task (updatedAt/updatedBy are set by the repository). */
export type TaskPatch = Partial<
  Pick<Task, "name" | "memo" | "priority" | "completed" | "completedAt" | "deleted" | "sortOrder">
>;

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

/** Gap between neighbors when a task goes to the end of its priority (one second, in sortOrder units). */
export const SORT_ORDER_STEP = 1000;

/** The position used for sorting: sortOrder, or the creation time for tasks that have none. */
export function orderOf(task: Pick<Task, "sortOrder" | "createdAt">): number {
  return task.sortOrder ?? Date.parse(task.createdAt);
}

/**
 * sortOrder that puts a task at the end of `priority` (requirements §5.5): after every other task there,
 * completed ones included so that reopening one keeps its place, and never before `now`.
 */
export function endSortOrder(tasks: readonly Task[], priority: Priority, now: Date, excludeId?: string): number {
  const orders = tasks.filter((t) => !t.deleted && t.priority === priority && t.id !== excludeId).map(orderOf);
  return Math.max(now.getTime(), ...orders.map((o) => o + SORT_ORDER_STEP));
}

/** Sort: priority order (NOW first), then sortOrder (orderOf), then oldest first. */
export function compareTasks(a: Task, b: Task): number {
  const byPriority = PRIORITIES.indexOf(a.priority) - PRIORITIES.indexOf(b.priority);
  if (byPriority !== 0) return byPriority;
  const byOrder = orderOf(a) - orderOf(b);
  if (byOrder !== 0) return byOrder;
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
