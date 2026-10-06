import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { SessionRecord } from "@shared/session";
import type { Task, TaskPatch } from "@shared/task";

export interface Preferences {
  lastSelectedTaskId: string | null;
  nextTaskId: string | null;
}

/**
 * Persistence boundary: a local JSON file (JsonFileTaskRepository) or
 * Firestore (FirestoreTaskRepository, requirements §5.1).
 *
 * Writes only send the changed fields so that concurrent edits from the PC
 * and Android do not overwrite each other (requirements §5.3). The
 * repository stamps updatedAt / updatedBy itself.
 */
export interface TaskRepository {
  /** All tasks including soft-deleted ones. */
  listTasks(): Promise<Task[]>;
  getTask(id: string): Promise<Task | null>;
  createTask(task: Task): Promise<void>;
  updateTask(id: string, patch: TaskPatch): Promise<void>;
  /** Append a session and add its minutes to the task in one write. */
  recordSession(session: SessionRecord): Promise<void>;
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

  constructor(
    private readonly file: string,
    private readonly now: () => Date = () => new Date(),
  ) {
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

  async createTask(task: Task): Promise<void> {
    if (this.data.tasks.some((x) => x.id === task.id)) throw new Error(`Task already exists: ${task.id}`);
    this.data.tasks.push({ ...task });
    this.write();
  }

  async updateTask(id: string, patch: TaskPatch): Promise<void> {
    const t = this.data.tasks.find((x) => x.id === id);
    if (!t) throw new Error(`Task not found: ${id}`);
    Object.assign(t, patch, { updatedAt: this.now().toISOString(), updatedBy: "desktop" });
    this.write();
  }

  async recordSession(session: SessionRecord): Promise<void> {
    this.data.sessions.push({ ...session });
    const t = this.data.tasks.find((x) => x.id === session.taskId);
    if (t) {
      t.totalMinutes += session.elapsedMinutes;
      t.sessionCount += 1;
      t.updatedAt = this.now().toISOString();
      t.updatedBy = "desktop";
    }
    this.write();
  }

  /** Local data that has not been copied to Firestore yet. */
  hasData(): boolean {
    return this.data.tasks.some((t) => !t.deleted);
  }

  async listSessions(): Promise<SessionRecord[]> {
    return this.data.sessions.map((s) => ({ ...s }));
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
