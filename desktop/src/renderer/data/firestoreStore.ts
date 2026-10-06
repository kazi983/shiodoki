/**
 * All Firestore reads and writes for one signed-in user.
 *
 * Writes are not awaited until the server acknowledges them: with offline
 * persistence the promise only resolves once the server has the data, which
 * never happens while offline. The local cache (and every snapshot listener)
 * sees the write immediately, and the SDK sends it when back online.
 */

import {
  collection,
  doc,
  getCountFromServer,
  increment,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  waitForPendingWrites,
  writeBatch,
  type Firestore,
} from "firebase/firestore";
import type { SessionRecord } from "@shared/session";
import type { DesktopStateData, PreferencesData, SyncStatus } from "@shared/sync";
import type { Task, TaskPatch } from "@shared/task";
import {
  desktopStateToDoc,
  docToPreferences,
  docToTask,
  patchToDoc,
  sessionToDoc,
  taskToDoc,
} from "./mapping";

export interface StoreListeners {
  onTasks(tasks: Task[], status: Exclude<SyncStatus, "local">): void;
  onPreferences(preferences: PreferencesData): void;
  onError(error: Error): void;
}

/** Firestore batches are limited to 500 writes. */
const BATCH_LIMIT = 450;

export class FirestoreStore {
  constructor(
    private readonly db: Firestore,
    private readonly uid: string,
    private readonly onWriteError: (error: Error) => void = (e) => console.error(e),
  ) {}

  private get base() {
    return `users/${this.uid}`;
  }

  subscribe(listeners: StoreListeners): () => void {
    const offTasks = onSnapshot(
      collection(this.db, `${this.base}/tasks`),
      { includeMetadataChanges: true },
      (snap) => {
        const tasks = snap.docs.map((d) => docToTask(d.id, d.data({ serverTimestamps: "estimate" })));
        const status = snap.metadata.hasPendingWrites ? "pending" : snap.metadata.fromCache ? "offline" : "synced";
        listeners.onTasks(tasks, status);
      },
      (error) => listeners.onError(error),
    );
    const offPrefs = onSnapshot(
      doc(this.db, `${this.base}/state/preferences`),
      (snap) => listeners.onPreferences(docToPreferences(snap.data())),
      (error) => listeners.onError(error),
    );
    return () => {
      offTasks();
      offPrefs();
    };
  }

  createTask(task: Task): void {
    this.fire(setDoc(doc(this.db, `${this.base}/tasks/${task.id}`), taskToDoc(task)));
  }

  updateTask(id: string, patch: TaskPatch): void {
    this.fire(updateDoc(doc(this.db, `${this.base}/tasks/${id}`), patchToDoc(patch)));
  }

  /** Session log + task totals in one atomic write (increment() never loses concurrent additions). */
  recordSession(session: SessionRecord): void {
    const batch = writeBatch(this.db);
    batch.set(doc(this.db, `${this.base}/sessions/${session.id}`), sessionToDoc(session));
    batch.update(doc(this.db, `${this.base}/tasks/${session.taskId}`), {
      totalMinutes: increment(session.elapsedMinutes),
      sessionCount: increment(1),
      updatedAt: serverTimestamp(),
      updatedBy: "desktop",
    });
    this.fire(batch.commit());
  }

  setPreferences(patch: Partial<PreferencesData>): void {
    this.fire(
      setDoc(doc(this.db, `${this.base}/state/preferences`), { ...patch, updatedAt: serverTimestamp() }, { merge: true }),
    );
  }

  setDesktopState(state: DesktopStateData): void {
    this.fire(setDoc(doc(this.db, `${this.base}/state/desktop`), desktopStateToDoc(state)));
  }

  /** Number of tasks on the server (needs a connection). */
  async countRemoteTasks(): Promise<number> {
    const snap = await getCountFromServer(collection(this.db, `${this.base}/tasks`));
    return snap.data().count;
  }

  /** One-time copy of local tasks (requirements D-07). Waits for the server. */
  async importTasks(tasks: Task[], preferences: Partial<PreferencesData>): Promise<void> {
    for (let i = 0; i < tasks.length; i += BATCH_LIMIT) {
      const batch = writeBatch(this.db);
      for (const task of tasks.slice(i, i + BATCH_LIMIT)) {
        batch.set(doc(this.db, `${this.base}/tasks/${task.id}`), taskToDoc(task, "migration"));
      }
      await batch.commit();
    }
    if (Object.keys(preferences).length > 0) {
      await setDoc(
        doc(this.db, `${this.base}/state/preferences`),
        { ...preferences, updatedAt: serverTimestamp() },
        { merge: true },
      );
    }
  }

  /** Wait until the server has every pending write, or give up after timeoutMs (offline). */
  async flush(timeoutMs: number): Promise<boolean> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<boolean>((resolve) => {
      timer = setTimeout(() => resolve(false), timeoutMs);
    });
    try {
      return await Promise.race([waitForPendingWrites(this.db).then(() => true), timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  private fire(write: Promise<unknown>): void {
    write.catch((error: Error) => this.onWriteError(error));
  }
}
