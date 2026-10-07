export type EndReason = "completed" | "interval" | "leave_stop" | "app_exit";

/** One finished work session. Mirrors users/{uid}/sessions/{sessionId}. */
export interface SessionRecord {
  id: string;
  taskId: string;
  taskName: string;
  /** ISO 8601 (UTC) */
  startedAt: string;
  /** ISO 8601 (UTC) */
  endedAt: string;
  elapsedMinutes: number;
  endReason: EndReason;
  device: string;
}

export function elapsedMinutes(startedAt: Date, endedAt: Date): number {
  return Math.max(0, Math.floor((endedAt.getTime() - startedAt.getTime()) / 60000));
}

/** Time worked per task since the start of the work day (block screen). */
export interface DaySummary {
  totalMinutes: number;
  sessionCount: number;
  /** Most time first. */
  tasks: Array<{ taskId: string; taskName: string; minutes: number }>;
}

/** Hour at which a new work day starts, so working past midnight still counts as "today". */
export const DAY_START_HOUR = 4;

export function startOfWorkDay(now: Date): Date {
  const start = new Date(now);
  start.setHours(DAY_START_HOUR, 0, 0, 0);
  if (start.getTime() > now.getTime()) start.setDate(start.getDate() - 1);
  return start;
}

export function summarizeSessions(sessions: SessionRecord[]): DaySummary {
  const byTask = new Map<string, { taskId: string; taskName: string; minutes: number }>();
  let totalMinutes = 0;
  for (const s of sessions) {
    totalMinutes += s.elapsedMinutes;
    const entry = byTask.get(s.taskId) ?? { taskId: s.taskId, taskName: s.taskName, minutes: 0 };
    entry.minutes += s.elapsedMinutes;
    entry.taskName = s.taskName;
    byTask.set(s.taskId, entry);
  }
  return {
    totalMinutes,
    sessionCount: sessions.length,
    tasks: [...byTask.values()].sort((a, b) => b.minutes - a.minutes),
  };
}
