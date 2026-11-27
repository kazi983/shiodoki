/** `screen_off`: the screen blanked or locked, or the system suspended (Android: screen turned off). */
export type EndReason = "completed" | "interval" | "leave_stop" | "app_exit" | "screen_off";

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
  /** Worked past the leave schedule's stop time (the block screen was up). Missing means false. */
  overtime?: boolean;
}

export function elapsedMinutes(startedAt: Date, endedAt: Date): number {
  return Math.max(0, Math.floor((endedAt.getTime() - startedAt.getTime()) / 60000));
}

/** Time worked per task since the start of the work day (block screen). */
export interface DaySummary {
  /** Overtime included. */
  totalMinutes: number;
  /** Part of totalMinutes worked past the stop time. */
  overtimeMinutes: number;
  sessionCount: number;
  /** Most time first; `minutes` includes `overtimeMinutes`. */
  tasks: Array<{ taskId: string; taskName: string; minutes: number; overtimeMinutes: number }>;
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
  const byTask = new Map<string, DaySummary["tasks"][number]>();
  let totalMinutes = 0;
  let overtimeMinutes = 0;
  for (const s of sessions) {
    const overtime = s.overtime ? s.elapsedMinutes : 0;
    totalMinutes += s.elapsedMinutes;
    overtimeMinutes += overtime;
    const entry = byTask.get(s.taskId) ?? { taskId: s.taskId, taskName: s.taskName, minutes: 0, overtimeMinutes: 0 };
    entry.minutes += s.elapsedMinutes;
    entry.overtimeMinutes += overtime;
    entry.taskName = s.taskName;
    byTask.set(s.taskId, entry);
  }
  return {
    totalMinutes,
    overtimeMinutes,
    sessionCount: sessions.length,
    tasks: [...byTask.values()].sort((a, b) => b.minutes - a.minutes),
  };
}
