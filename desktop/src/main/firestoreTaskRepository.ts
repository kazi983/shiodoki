import type { SessionRecord } from "@shared/session";
import type { DataEvent, DataRequest, DesktopStateData, PreferencesData, SyncStatus } from "@shared/sync";
import type { Task, TaskPatch } from "@shared/task";
import type { Preferences, TaskRepository } from "./taskRepository";

export interface DataRequester {
  request<T = unknown>(request: DataRequest, timeoutMs?: number): Promise<T>;
}

/**
 * TaskRepository backed by Firestore through the hidden data window.
 *
 * Reads come from an in-memory copy kept up to date by Firestore snapshot
 * listeners (which include local, not-yet-sent writes), so the UI never
 * waits for the network. Writes update that copy immediately and are queued
 * by the Firestore SDK, which sends them when online.
 */
export class FirestoreTaskRepository implements TaskRepository {
  private tasks = new Map<string, Task>();
  private preferences: PreferencesData = { lastSelectedTaskId: null, nextTaskId: null };
  private syncStatus: Exclude<SyncStatus, "local"> = "offline";
  private firstSnapshot: Promise<void>;
  private resolveFirstSnapshot!: () => void;

  constructor(
    private readonly data: DataRequester,
    private readonly onChanged: () => void,
    private readonly firstSnapshotTimeoutMs = 5_000,
  ) {
    this.firstSnapshot = new Promise((resolve) => (this.resolveFirstSnapshot = resolve));
  }

  /** Feed events from the data window. */
  handleEvent(event: DataEvent): void {
    if (event.type === "tasks") {
      this.tasks = new Map(event.tasks.map((t) => [t.id, t]));
      this.syncStatus = event.status;
      this.resolveFirstSnapshot();
      this.onChanged();
    } else if (event.type === "preferences") {
      this.preferences = event.preferences;
      this.onChanged();
    }
  }

  get status(): Exclude<SyncStatus, "local"> {
    return this.syncStatus;
  }

  async listTasks(): Promise<Task[]> {
    await this.waitForFirstSnapshot();
    return [...this.tasks.values()].map((t) => ({ ...t }));
  }

  async getTask(id: string): Promise<Task | null> {
    await this.waitForFirstSnapshot();
    const t = this.tasks.get(id);
    return t ? { ...t } : null;
  }

  async createTask(task: Task): Promise<void> {
    this.tasks.set(task.id, { ...task });
    await this.data.request({ op: "createTask", task });
  }

  async updateTask(id: string, patch: TaskPatch): Promise<void> {
    const t = this.tasks.get(id);
    if (!t) throw new Error(`Task not found: ${id}`);
    this.tasks.set(id, { ...t, ...patch, updatedAt: new Date().toISOString(), updatedBy: "desktop" });
    await this.data.request({ op: "updateTask", id, patch });
  }

  async recordSession(session: SessionRecord): Promise<void> {
    const t = this.tasks.get(session.taskId);
    if (t) {
      this.tasks.set(t.id, {
        ...t,
        totalMinutes: t.totalMinutes + session.elapsedMinutes,
        sessionCount: t.sessionCount + 1,
      });
    }
    await this.data.request({ op: "recordSession", session });
  }

  async getPreferences(): Promise<Preferences> {
    return { ...this.preferences };
  }

  async setPreferences(patch: Partial<Preferences>): Promise<void> {
    this.preferences = { ...this.preferences, ...patch };
    await this.data.request({ op: "setPreferences", patch });
  }

  async setDesktopState(state: DesktopStateData): Promise<void> {
    await this.data.request({ op: "setDesktopState", state });
  }

  /** Give pending writes a chance to reach the server (e.g. before quitting). */
  async flush(timeoutMs: number): Promise<boolean> {
    return this.data.request<boolean>({ op: "flush", timeoutMs }, timeoutMs + 5_000);
  }

  private async waitForFirstSnapshot(): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      this.firstSnapshot,
      new Promise<void>((resolve) => (timer = setTimeout(resolve, this.firstSnapshotTimeoutMs))),
    ]);
    clearTimeout(timer);
  }
}
