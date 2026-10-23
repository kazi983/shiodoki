/**
 * Task lists grouped by priority as one flat list of headings and tasks, so that a task dragged past a heading
 * lands in that priority (requirements §5.5). The drag itself is in the renderer (taskDrag.tsx).
 */

import { PRIORITIES, type Priority, type Task, type TaskDrop } from "./task";

export interface PriorityGroup {
  priority: Priority;
  tasks: Task[];
}

/** A line of a grouped task list: a heading, or a task under the closest heading above it. */
export type TaskListEntry =
  { kind: "heading"; key: string; priority: Priority } | { kind: "task"; key: string; task: Task };

/** `tasks` under their priorities in the fixed order, keeping their order within each; empty ones left out. */
export function groupTasks(tasks: readonly Task[]): PriorityGroup[] {
  return PRIORITIES.map((p) => ({ priority: p, tasks: tasks.filter((t) => t.priority === p) })).filter(
    (g) => g.tasks.length > 0,
  );
}

/** Each group's heading followed by its tasks. `allHeadings` adds the priorities without tasks too. */
export function entriesOf(groups: readonly PriorityGroup[], allHeadings: boolean): TaskListEntry[] {
  const priorities = allHeadings ? PRIORITIES : groups.map((g) => g.priority);
  return priorities.flatMap((priority): TaskListEntry[] => [
    { kind: "heading", key: `heading:${priority}`, priority },
    ...(groups.find((g) => g.priority === priority)?.tasks ?? []).map((task): TaskListEntry => ({
      kind: "task",
      key: task.id,
      task,
    })),
  ]);
}

/** The entry at `from` moved to `to`. Nothing goes above the first heading. */
export function moved(entries: readonly TaskListEntry[], from: number, to: number): TaskListEntry[] {
  if (from === to || from < 0 || from >= entries.length || to < 1 || to >= entries.length) return [...entries];
  const next = [...entries];
  next.splice(to, 0, ...next.splice(from, 1));
  return next;
}

/** Without the headings that have no tasks under them: the list as shown when not dragging. */
export function withoutEmptyHeadings(entries: readonly TaskListEntry[]): TaskListEntry[] {
  return entries.filter((e, i) => e.kind !== "heading" || entries[i + 1]?.kind === "task");
}

/** Where `taskId` is: the heading above it and the tasks under that heading. null when it is not listed. */
export function dropOf(entries: readonly TaskListEntry[], taskId: string): TaskDrop | null {
  const index = entries.findIndex((e) => e.key === taskId);
  let h = index;
  while (h >= 0 && entries[h].kind !== "heading") h--;
  const heading = entries[h];
  if (index < 0 || heading?.kind !== "heading") return null;
  const orderedIds: string[] = [];
  for (let i = h + 1; i < entries.length && entries[i].kind === "task"; i++) orderedIds.push(entries[i].key);
  return { taskId, priority: heading.priority, orderedIds };
}

/**
 * One step up or down for the keyboard (Alt+↑/↓): past a heading the task moves to the neighboring priority. null
 * at the ends.
 */
export function stepDrop(groups: readonly PriorityGroup[], taskId: string, step: -1 | 1): TaskDrop | null {
  const entries = entriesOf(groups, true);
  const from = entries.findIndex((e) => e.key === taskId);
  const to = from + step;
  if (from < 0 || to < 1 || to >= entries.length) return null;
  return dropOf(moved(entries, from, to), taskId);
}
