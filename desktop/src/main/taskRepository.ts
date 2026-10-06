import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { SessionRecord } from "@shared/session";
import type { Task } from "@shared/task";

export interface Preferences {
  lastSelectedTaskId: string | null;
  nextTaskId: string | null;
}

/**
 * Persistence boundary. P2 uses a local JSON file; P3 replaces this with a
 * Firestore implementation (same shape as requirements §5.1).
 */
export interface TaskRepository {
  /** All tasks including soft-deleted ones. */
  listTasks(): Promise<Task[]>;
  getTask(id: string): Promise<Task | null>;
  putTask(task: Task): Promise<void>;
  /** Append a session and add its minutes to the task in one write. */
  recordSession(session: SessionRecord, updatedAt: string): Promise<void>;
  getPreferences(): Promise<Preferences>;
  setPreferences(patch: Partial<Preferences>): Promise<void>;
}

interface StoreData {
  version: 1;
  tasks: Task[];
  sessions: SessionRecord[];
  preferences: Preferences;
  legacyImportedAt: string | null;
}

function emptyStore(): StoreData {
  return {
    version: 1,
    tasks: [],
    sessions: [],
    preferences: { lastSelectedTaskId: null, nextTaskId: null },
    legacyImportedAt: null,
  };
}

/** Whole-file JSON store with atomic writes (write temp file, then rename). */
export class JsonFileTaskRepository implements TaskRepository {
  private data: StoreData;

  constructor(private readonly file: string) {
    this.data = existsSync(file) ? this.read() : emptyStore();
  }

  get exists(): boolean {
    return existsSync(this.file);
  }

  async listTasks(): Promise<Task[]> {
    return this.data.tasks.map((t) => ({ ...t }));
  }

  async getTask(id: string): Promise<Task | null> {
    const t = this.data.tasks.find((x) => x.id === id);
    return t ? { ...t } : null;
  }

  async putTask(task: Task): Promise<void> {
    const i = this.data.tasks.findIndex((x) => x.id === task.id);
    if (i >= 0) this.data.tasks[i] = { ...task };
    else this.data.tasks.push({ ...task });
    this.write();
  }

  async recordSession(session: SessionRecord, updatedAt: string): Promise<void> {
    this.data.sessions.push({ ...session });
    const t = this.data.tasks.find((x) => x.id === session.taskId);
    if (t) {
      t.totalMinutes += session.elapsedMinutes;
      t.sessionCount += 1;
      t.updatedAt = updatedAt;
      t.updatedBy = "desktop";
    }
    this.write();
  }

  async getPreferences(): Promise<Preferences> {
    return { ...this.data.preferences };
  }

  async setPreferences(patch: Partial<Preferences>): Promise<void> {
    this.data.preferences = { ...this.data.preferences, ...patch };
    this.write();
  }

  /** Seed from v1 tasks.json. Only used when the store does not exist yet. */
  importLegacy(tasks: Task[], lastSelectedTaskId: string | null, now: Date): void {
    this.data = {
      ...emptyStore(),
      tasks: tasks.map((t) => ({ ...t })),
      preferences: { lastSelectedTaskId, nextTaskId: null },
      legacyImportedAt: now.toISOString(),
    };
    this.write();
  }

  private read(): StoreData {
    try {
      const parsed = JSON.parse(readFileSync(this.file, "utf8")) as Partial<StoreData>;
      return {
        ...emptyStore(),
        ...parsed,
        preferences: { ...emptyStore().preferences, ...parsed.preferences },
      };
    } catch (error) {
      throw new Error(`データファイルを読み込めませんでした: ${this.file}: ${String(error)}`);
    }
  }

  private write(): void {
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.data, null, 2), "utf8");
    renameSync(tmp, this.file);
  }
}
