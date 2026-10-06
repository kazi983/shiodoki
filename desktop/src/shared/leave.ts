/**
 * Leave schedule: the user enters the time they need to leave and how many
 * minutes before that they want to stop working. A warning fires 5 minutes
 * before the stop time and the stop (block) fires at the stop time.
 */

export const WARNING_LEAD_MINUTES = 5;
export const BUFFER_OPTIONS = [5, 10, 15, 20, 25, 30] as const;
export const DEFAULT_LEAVE_TIME = "23:30";
export const DEFAULT_BUFFER_MINUTES = 15;

export interface LeaveScheduleInput {
  /** "HH:MM" */
  leaveTime: string;
  bufferMinutes: number;
}

export interface LeaveSchedule {
  leaveAt: Date;
  bufferMinutes: number;
  stopAt: Date;
  warnAt: Date;
}

/** Serializable form sent to the renderer. */
export interface LeaveScheduleStatus {
  leaveAt: string;
  stopAt: string;
  bufferMinutes: number;
}

/**
 * Normalize loose time input to "HH:MM".
 *   "9" -> "09:00", "930" -> "09:30", "1830" -> "18:30", "4:5" -> "04:05"
 * Throws on invalid input.
 */
export function normalizeTimeInput(value: string): string {
  const v = value.trim().replace("：", ":");
  let hour: number;
  let minute: number;

  if (v.includes(":")) {
    const parts = v.split(":");
    if (parts.length !== 2 || !/^\d{1,2}$/.test(parts[0]) || !/^\d{1,2}$/.test(parts[1])) {
      throw new Error("時刻の形式が正しくありません");
    }
    hour = Number(parts[0]);
    minute = Number(parts[1]);
  } else if (/^\d{1,4}$/.test(v)) {
    if (v.length <= 2) {
      hour = Number(v);
      minute = 0;
    } else if (v.length === 3) {
      hour = Number(v.slice(0, 1));
      minute = Number(v.slice(1));
    } else {
      hour = Number(v.slice(0, 2));
      minute = Number(v.slice(2));
    }
  } else {
    throw new Error("時刻の形式が正しくありません");
  }

  if (hour > 23 || minute > 59) throw new Error("時刻の形式が正しくありません");

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/**
 * Resolve "HH:MM" to the next occurrence after `now` (local time).
 * A time that has already passed today means tomorrow, so a leave time
 * after midnight (e.g. "01:00" entered at 22:00) works.
 */
export function resolveNextOccurrence(hhmm: string, now: Date): Date {
  const [h, m] = normalizeTimeInput(hhmm).split(":").map(Number);
  const at = new Date(now);
  at.setHours(h, m, 0, 0);
  if (at.getTime() <= now.getTime()) at.setDate(at.getDate() + 1);
  return at;
}

export function buildLeaveSchedule(input: LeaveScheduleInput, now: Date): LeaveSchedule {
  if (!Number.isInteger(input.bufferMinutes) || input.bufferMinutes < 0) {
    throw new Error("何分前に止めるかが正しくありません");
  }
  const leaveAt = resolveNextOccurrence(input.leaveTime, now);
  const stopAt = new Date(leaveAt.getTime() - input.bufferMinutes * 60000);
  const warnAt = new Date(stopAt.getTime() - WARNING_LEAD_MINUTES * 60000);
  return { leaveAt, bufferMinutes: input.bufferMinutes, stopAt, warnAt };
}

export function formatHHMM(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
