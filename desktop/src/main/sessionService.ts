import { randomUUID } from "node:crypto";
import { elapsedMinutes, type EndReason, type SessionRecord } from "@shared/session";
import type { Task } from "@shared/task";

interface RunningSession {
  taskId: string;
  taskName: string;
  startedAt: Date;
  overtime: boolean;
}

/**
 * Tracks the currently running session. finish() returns the record once
 * and clears the state, so calling it from several exit paths never
 * double-counts time.
 */
export class SessionService {
  private running: RunningSession | null = null;

  constructor(private readonly device: string) {}

  /** `overtime`: started at the leave schedule's stop time, to keep counting past it. */
  start(task: Pick<Task, "id" | "name">, now: Date = new Date(), options: { overtime?: boolean } = {}): void {
    this.running = { taskId: task.id, taskName: task.name, startedAt: now, overtime: options.overtime ?? false };
  }

  get current(): Readonly<RunningSession> | null {
    return this.running;
  }

  finish(reason: EndReason, now: Date = new Date()): SessionRecord | null {
    const record = this.peek(reason, now);
    this.running = null;
    return record;
  }

  /** The record finish() would return, without ending the session (to show it while it runs). */
  peek(reason: EndReason, now: Date = new Date()): SessionRecord | null {
    const s = this.running;
    if (!s) return null;
    return {
      id: randomUUID(),
      taskId: s.taskId,
      taskName: s.taskName,
      startedAt: s.startedAt.toISOString(),
      endedAt: now.toISOString(),
      elapsedMinutes: elapsedMinutes(s.startedAt, now),
      endReason: reason,
      device: this.device,
      ...(s.overtime ? { overtime: true } : {}),
    };
  }
}
