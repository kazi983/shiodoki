/**
 * FirestoreStore against the Auth + Firestore emulators with the real
 * security rules (v2/firebase/firestore.rules), so every write the app makes
 * is checked by the rules.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { deleteApp, initializeApp, type FirebaseApp } from "firebase/app";
import { GoogleAuthProvider, connectAuthEmulator, getAuth, signInWithCredential } from "firebase/auth";
import {
  connectFirestoreEmulator,
  doc,
  getDoc,
  getDocs,
  collection,
  initializeFirestore,
  memoryLocalCache,
  terminate,
  type Firestore,
} from "firebase/firestore";
import { EMULATOR_PROJECT_ID } from "@shared/firebaseConfig";
import type { Task } from "@shared/task";
import type { PreferencesData } from "@shared/sync";
import { FirestoreStore } from "../src/renderer/data/firestoreStore";

let app: FirebaseApp;
let db: Firestore;
let uid: string;
let store: FirestoreStore;
const writeErrors: Error[] = [];

function newTask(overrides: Partial<Task> = {}): Task {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    name: "Integration task",
    memo: "",
    priority: "NOW",
    completed: false,
    completedAt: null,
    deleted: false,
    totalMinutes: 0,
    sessionCount: 0,
    createdAt: now,
    updatedAt: now,
    updatedBy: "desktop",
    ...overrides,
  };
}

async function until<T>(read: () => Promise<T>, ok: (v: T) => boolean): Promise<T> {
  for (let i = 0; i < 50; i++) {
    const v = await read();
    if (ok(v)) return v;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("condition not met");
}

beforeAll(async () => {
  app = initializeApp({ apiKey: "demo-key", projectId: EMULATOR_PROJECT_ID }, `it-${Date.now()}`);
  const auth = getAuth(app);
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  // The Auth emulator accepts an unsigned JSON "ID token" for Google sign-in.
  const fakeIdToken = JSON.stringify({ sub: `user-${Date.now()}`, email: "tester@example.com", email_verified: true });
  const cred = await signInWithCredential(auth, GoogleAuthProvider.credential(fakeIdToken));
  uid = cred.user.uid;

  db = initializeFirestore(app, { localCache: memoryLocalCache() });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  store = new FirestoreStore(db, uid, (e) => writeErrors.push(e));
});

afterAll(async () => {
  await terminate(db);
  await deleteApp(app);
});

describe("FirestoreStore (rules enforced)", () => {
  test("create, update and soft delete a task", async () => {
    const task = newTask({ completedAt: null });
    store.createTask(task);
    store.updateTask(task.id, { name: "Renamed", priority: "SOONER", memo: "note" });
    store.updateTask(task.id, { completed: true, completedAt: new Date().toISOString() });
    store.updateTask(task.id, { completed: false, completedAt: null });
    store.updateTask(task.id, { deleted: true });
    expect(await store.flush(10000)).toBe(true);

    const snap = await getDoc(doc(db, `users/${uid}/tasks/${task.id}`));
    expect(snap.data()).toMatchObject({
      name: "Renamed",
      priority: "SOONER",
      memo: "note",
      completed: false,
      completedAt: null,
      deleted: true,
      updatedBy: "desktop",
    });
    expect(writeErrors).toEqual([]);
  });

  test("recordSession appends a session and increments totals atomically", async () => {
    const task = newTask();
    store.createTask(task);
    for (const minutes of [30, 12]) {
      store.recordSession({
        id: randomUUID(),
        taskId: task.id,
        taskName: task.name,
        startedAt: new Date(Date.now() - minutes * 60000).toISOString(),
        endedAt: new Date().toISOString(),
        elapsedMinutes: minutes,
        endReason: "interval",
        device: "test-pc",
      });
    }
    expect(await store.flush(10000)).toBe(true);
    const snap = await getDoc(doc(db, `users/${uid}/tasks/${task.id}`));
    expect(snap.data()).toMatchObject({ totalMinutes: 42, sessionCount: 2 });
    const sessions = await getDocs(collection(db, `users/${uid}/sessions`));
    expect(sessions.docs.filter((d) => d.data().taskId === task.id)).toHaveLength(2);
    expect(writeErrors).toEqual([]);
  });

  test("preferences and desktop state", async () => {
    store.setPreferences({ lastSelectedTaskId: "abc" });
    store.setDesktopState({
      status: "running",
      currentTaskId: "abc",
      currentTaskName: "Task",
      startedAt: new Date().toISOString(),
      nextPromptAt: new Date(Date.now() + 30 * 60000).toISOString(),
      device: "test-pc",
    });
    store.setDesktopState({
      status: "stopped",
      currentTaskId: null,
      currentTaskName: null,
      startedAt: null,
      nextPromptAt: null,
      device: "test-pc",
    });
    expect(await store.flush(10000)).toBe(true);
    expect((await getDoc(doc(db, `users/${uid}/state/preferences`))).data()).toMatchObject({
      lastSelectedTaskId: "abc",
    });
    expect((await getDoc(doc(db, `users/${uid}/state/desktop`))).data()).toMatchObject({
      status: "stopped",
      device: "test-pc",
    });
    expect(writeErrors).toEqual([]);
  });

  test("subscribe delivers tasks and preferences", async () => {
    let tasks: Task[] = [];
    let prefs: PreferencesData | null = null;
    const off = store.subscribe({
      onTasks: (t) => (tasks = t),
      onPreferences: (p) => (prefs = p),
      onError: (e) => writeErrors.push(e),
    });
    const task = newTask({ name: "Live" });
    store.createTask(task);
    await until(async () => tasks, (t) => t.some((x) => x.id === task.id && x.name === "Live"));
    await until(async () => prefs, (p) => p?.lastSelectedTaskId === "abc");
    off();
  });

  test("importTasks copies tasks with their totals and counts them", async () => {
    const before = await store.countRemoteTasks();
    const imported = Array.from({ length: 3 }, (_, i) =>
      newTask({ name: `Imported ${i}`, totalMinutes: 90, sessionCount: 3, priority: "SOMEDAY" }),
    );
    await store.importTasks(imported, { lastSelectedTaskId: imported[0].id });
    expect(await store.countRemoteTasks()).toBe(before + 3);
    const snap = await getDoc(doc(db, `users/${uid}/tasks/${imported[0].id}`));
    expect(snap.data()).toMatchObject({ totalMinutes: 90, sessionCount: 3, updatedBy: "migration" });
  });

  test("writes to another user's data are rejected by the rules", async () => {
    const other = new FirestoreStore(db, "someone-else", (e) => writeErrors.push(e));
    other.createTask(newTask());
    await until(async () => writeErrors.length, (n) => n > 0);
    expect(writeErrors[0].message).toMatch(/permission/i);
    writeErrors.length = 0;
  });
});
