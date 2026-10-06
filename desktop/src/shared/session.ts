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
