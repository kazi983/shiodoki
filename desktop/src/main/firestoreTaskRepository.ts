import { t } from "@shared/i18n";
import type { SessionRecord } from "@shared/session";
import type { DataEvent, DataRequest, DesktopStateData, PreferencesData, SyncStatus } from "@shared/sync";
import type { Task, TaskPatch } from "@shared/task";
import type { FieldCipher } from "./encryptionService";
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
 *
 * End-to-end encryption happens here: task names, memos and session task names are encrypted just before a request
 * leaves for the data window and decrypted just after a snapshot arrives, so the cache and every caller see plain
 * text and the data window only ever sees ciphertext.
 */
export class FirestoreTaskRepository implements TaskRepository {
  private tasks = new Map<string, Task>();
  /** The last snapshot as received (encrypted), decoded again once the data key is there. */
  private encryptedTasks: Task[] | null = null;
  private preferences: PreferencesData = { lastSelectedTaskId: null, nextTaskId: null };
  private syncStatus: Exclude<SyncStatus, "local"> = "offline";
  private firstSnapshot: Promise<void>;
  private resolveFirstSnapshot!: () => void;

  constructor(
    private readonly data: DataRequester,
    private readonly onChanged: () => void,
    private readonly cipher: FieldCipher,
    private readonly firstSnapshotTimeoutMs = 5_000,
  ) {
    this.firstSnapshot = new Promise((resolve) => (this.resolveFirstSnapshot = resolve));
  }

  /** Feed events from the data window. */
  handleEvent(event: DataEvent): void {
    if (event.type === "tasks") {
      this.encryptedTasks = event.tasks;
      this.syncStatus = event.status;
      this.decodeTasks();
    } else if (event.type === "preferences") {
      this.preferences = event.preferences;
      this.onChanged();
    }
  }

  /** Call once the data key is held: the snapshots that arrived before become readable. */
  unlocked(): void {
    this.decodeTasks();
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
    await this.data.request({ op: "createTask", task: this.sealTask(task) });
  }

  async updateTask(id: string, patch: TaskPatch): Promise<void> {
    const t = this.tasks.get(id);
    if (!t) throw new Error(`Task not found: ${id}`);
    this.tasks.set(id, { ...t, ...patch, updatedAt: new Date().toISOString(), updatedBy: "desktop" });
    const sealed: TaskPatch = { ...patch };
    if (patch.name !== undefined) sealed.name = this.cipher.encrypt(patch.name);
    if (patch.memo !== undefined) sealed.memo = this.sealMemo(patch.memo);
    await this.data.request({ op: "updateTask", id, patch: sealed });
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
    await this.data.request({ op: "recordSession", session: this.sealSession(session) });
  }

  async listSessionsSince(since: Date): Promise<SessionRecord[]> {
    const sessions = await this.data.request<SessionRecord[]>({ op: "listSessionsSince", since: since.toISOString() });
    return sessions.map((s) => ({ ...s, taskName: this.open(s.taskName) }));
  }

  async getPreferences(): Promise<Preferences> {
    return { ...this.preferences };
  }

  async setPreferences(patch: Partial<Preferences>): Promise<void> {
    this.preferences = { ...this.preferences, ...patch };
    await this.data.request({ op: "setPreferences", patch });
  }

  async setDesktopState(state: DesktopStateData): Promise<void> {
    const currentTaskName = state.currentTaskName === null ? null : this.cipher.encrypt(state.currentTaskName);
    await this.data.request({ op: "setDesktopState", state: { ...state, currentTaskName } });
  }

  /** First sign-in: copy this PC's local data (requirements D-07). Waits for the server. */
  async importData(tasks: Task[], sessions: SessionRecord[], preferences: Partial<PreferencesData>): Promise<void> {
    await this.data.request(
      {
        op: "importTasks",
        tasks: tasks.map((task) => this.sealTask(task)),
        sessions: sessions.map((session) => this.sealSession(session)),
        preferences,
      },
      120_000,
    );
  }

  /** Give pending writes a chance to reach the server (e.g. before quitting). */
  async flush(timeoutMs: number): Promise<boolean> {
    return this.data.request<boolean>({ op: "flush", timeoutMs }, timeoutMs + 5_000);
  }

  private decodeTasks(): void {
    if (!this.encryptedTasks || !this.cipher.ready) return;
    this.tasks = new Map(
      this.encryptedTasks.map((task) => [task.id, { ...task, name: this.open(task.name), memo: this.open(task.memo) }]),
    );
    this.resolveFirstSnapshot();
    this.onChanged();
  }

  /** A value that cannot be decrypted (changed, or another key) is shown as a placeholder instead of failing. */
  private open(value: string): string {
    try {
      return this.cipher.decrypt(value);
    } catch {
      return t().encryption.unreadable;
    }
  }

  private sealTask(task: Task): Task {
    return { ...task, name: this.cipher.encrypt(task.name), memo: this.sealMemo(task.memo) };
  }

  /** An empty memo stays empty: nothing to hide, and most tasks have none. */
  private sealMemo(memo: string): string {
    return memo === "" ? "" : this.cipher.encrypt(memo);
  }

  private sealSession(session: SessionRecord): SessionRecord {
    return { ...session, taskName: this.cipher.encrypt(session.taskName) };
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
