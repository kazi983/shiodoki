import { randomUUID } from "node:crypto";
import { elapsedMinutes, type EndReason, type SessionRecord } from "@shared/session";
import type { Task } from "@shared/task";

interface RunningSession {
  taskId: string;
  taskName: string;
  startedAt: Date;
}

/**
 * Tracks the currently running session. finish() returns the record once
 * and clears the state, so calling it from several exit paths never
 * double-counts time.
 */
export class SessionService {
  private running: RunningSession | null = null;

  constructor(private readonly device: string) {}

  start(task: Pick<Task, "id" | "name">, now: Date = new Date()): void {
    this.running = { taskId: task.id, taskName: task.name, startedAt: now };
  }

  get current(): Readonly<RunningSession> | null {
    return this.running;
  }

  finish(reason: EndReason, now: Date = new Date()): SessionRecord | null {
    const s = this.running;
    if (!s) return null;
    this.running = null;
    return {
      id: randomUUID(),
      taskId: s.taskId,
      taskName: s.taskName,
      startedAt: s.startedAt.toISOString(),
      endedAt: now.toISOString(),
      elapsedMinutes: elapsedMinutes(s.startedAt, now),
      endReason: reason,
      device: this.device,
    };
  }
}
