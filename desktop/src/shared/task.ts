/**
 * Task domain model shared by main and renderer.
 * Field names follow the Firestore schema in v2/docs/requirements.md §5.1.
 */

export const PRIORITIES = ["NOW", "SOONER", "ANYTIME", "SOMEDAY"] as const;

export type Priority = (typeof PRIORITIES)[number];

export const DEFAULT_PRIORITY: Priority = "NOW";

export const PRIORITY_META: Record<Priority, { icon: string; label: string; color: string }> = {
  NOW: { icon: "🔥", label: "今すぐ", color: "#fee2e2" },
  SOONER: { icon: "⭐", label: "近いうち", color: "#fef3c7" },
  ANYTIME: { icon: "📝", label: "いつでも", color: "#dcfce7" },
  SOMEDAY: { icon: "💤", label: "いつか", color: "#f3f4f6" },
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
 * Throws an Error with a user-facing (Japanese) message when invalid.
 */
export function normalizeTaskInput(input: TaskInput): TaskInput {
  const name = input.name.trim();
  const memo = input.memo.trim();

  if (!name) throw new Error("タスク名を入力してください");
  if (name.length > MAX_NAME_LENGTH) throw new Error(`タスク名は${MAX_NAME_LENGTH}文字以内にしてください`);
  if (memo.length > MAX_MEMO_LENGTH) throw new Error(`メモは${MAX_MEMO_LENGTH}文字以内にしてください`);
  if (!isPriority(input.priority)) throw new Error("優先度が正しくありません");

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

export function formatMinutes(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}分`;
  return `${h}時間${m}分`;
}
