import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, test } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  Timestamp,
  deleteDoc,
  doc,
  getDoc,
  increment,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type Firestore,
} from "firebase/firestore";

const ALICE = "alice";
const BOB = "bob";

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-30min-task-timer",
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
});

function dbAs(uid: string | null): Firestore {
  const ctx = uid ? env.authenticatedContext(uid) : env.unauthenticatedContext();
  return ctx.firestore() as unknown as Firestore;
}

function newTask(overrides: Record<string, unknown> = {}) {
  return {
    name: "Write requirements",
    memo: "",
    priority: "NOW",
    completed: false,
    completedAt: null,
    deleted: false,
    totalMinutes: 0,
    sessionCount: 0,
    createdAt: Timestamp.fromDate(new Date("2026-10-01T00:00:00Z")),
    updatedAt: serverTimestamp(),
    updatedBy: "desktop",
    ...overrides,
  };
}

async function seedTask(uid: string, taskId: string) {
  await assertSucceeds(setDoc(doc(dbAs(uid), `users/${uid}/tasks/${taskId}`), newTask()));
}

describe("tasks", () => {
  test("owner can create and read a valid task", async () => {
    const db = dbAs(ALICE);
    await assertSucceeds(setDoc(doc(db, `users/${ALICE}/tasks/t1`), newTask()));
    await assertSucceeds(getDoc(doc(db, `users/${ALICE}/tasks/t1`)));
  });

  test("other users and anonymous callers are denied", async () => {
    await seedTask(ALICE, "t1");
    await assertFails(getDoc(doc(dbAs(BOB), `users/${ALICE}/tasks/t1`)));
    await assertFails(getDoc(doc(dbAs(null), `users/${ALICE}/tasks/t1`)));
    await assertFails(setDoc(doc(dbAs(BOB), `users/${ALICE}/tasks/t2`), newTask()));
  });

  test.each(["NOW", "SOONER", "ANYTIME", "SOMEDAY"])("accepts priority %s", async (priority) => {
    await assertSucceeds(
      setDoc(doc(dbAs(ALICE), `users/${ALICE}/tasks/t1`), newTask({ priority })),
    );
  });

  test.each(["なし", "", "HIGH", "now"])("rejects priority %j", async (priority) => {
    await assertFails(
      setDoc(doc(dbAs(ALICE), `users/${ALICE}/tasks/t1`), newTask({ priority })),
    );
  });

  test("rejects empty names, unknown fields and client-side updatedAt", async () => {
    const ref = doc(dbAs(ALICE), `users/${ALICE}/tasks/t1`);
    await assertFails(setDoc(ref, newTask({ name: "" })));
    await assertFails(setDoc(ref, newTask({ extra: 1 })));
    await assertFails(setDoc(ref, newTask({ updatedAt: Timestamp.now() })));
    await assertFails(setDoc(ref, newTask({ totalMinutes: -1 })));
  });

  test("owner can update fields and increment totals", async () => {
    await seedTask(ALICE, "t1");
    const ref = doc(dbAs(ALICE), `users/${ALICE}/tasks/t1`);
    await assertSucceeds(
      updateDoc(ref, { priority: "SOONER", updatedAt: serverTimestamp(), updatedBy: "android" }),
    );
    await assertSucceeds(
      updateDoc(ref, {
        totalMinutes: increment(30),
        sessionCount: increment(1),
        updatedAt: serverTimestamp(),
        updatedBy: "desktop",
      }),
    );
  });

  test("updates must refresh updatedAt and keep createdAt", async () => {
    await seedTask(ALICE, "t1");
    const ref = doc(dbAs(ALICE), `users/${ALICE}/tasks/t1`);
    await assertFails(updateDoc(ref, { priority: "SOONER" }));
    await assertFails(
      updateDoc(ref, { createdAt: Timestamp.now(), updatedAt: serverTimestamp() }),
    );
  });

  test("hard delete is denied (soft delete only)", async () => {
    await seedTask(ALICE, "t1");
    const ref = doc(dbAs(ALICE), `users/${ALICE}/tasks/t1`);
    await assertFails(deleteDoc(ref));
    await assertSucceeds(updateDoc(ref, { deleted: true, updatedAt: serverTimestamp() }));
  });
});

describe("sessions", () => {
  const session = {
    taskId: "t1",
    taskName: "Write requirements",
    startedAt: Timestamp.fromDate(new Date("2026-10-01T09:00:00Z")),
    endedAt: Timestamp.fromDate(new Date("2026-10-01T09:30:00Z")),
    elapsedMinutes: 30,
    endReason: "interval",
    device: "ubuntu-desktop",
  };

  test("session end is written together with the task increment", async () => {
    await seedTask(ALICE, "t1");
    const db = dbAs(ALICE);
    const batch = writeBatch(db);
    batch.set(doc(db, `users/${ALICE}/sessions/s1`), session);
    batch.update(doc(db, `users/${ALICE}/tasks/t1`), {
      totalMinutes: increment(30),
      sessionCount: increment(1),
      updatedAt: serverTimestamp(),
      updatedBy: "desktop",
    });
    await assertSucceeds(batch.commit());
  });

  test("sessions are append-only", async () => {
    const ref = doc(dbAs(ALICE), `users/${ALICE}/sessions/s1`);
    await assertSucceeds(setDoc(ref, session));
    await assertFails(updateDoc(ref, { elapsedMinutes: 99 }));
    await assertFails(deleteDoc(ref));
  });

  test("rejects invalid sessions", async () => {
    const ref = doc(dbAs(ALICE), `users/${ALICE}/sessions/s1`);
    await assertFails(setDoc(ref, { ...session, endReason: "unknown" }));
    await assertFails(setDoc(ref, { ...session, endedAt: session.startedAt, startedAt: session.endedAt }));
    await assertFails(setDoc(doc(dbAs(BOB), `users/${ALICE}/sessions/s2`), session));
  });
});

describe("state", () => {
  test("desktop status can be written by the owner", async () => {
    const ref = doc(dbAs(ALICE), `users/${ALICE}/state/desktop`);
    await assertSucceeds(
      setDoc(ref, {
        status: "running",
        currentTaskId: "t1",
        currentTaskName: "Write requirements",
        startedAt: Timestamp.now(),
        nextPromptAt: Timestamp.now(),
        heartbeatAt: serverTimestamp(),
        device: "ubuntu-desktop",
      }),
    );
    await assertSucceeds(
      setDoc(ref, { status: "stopped", heartbeatAt: serverTimestamp(), device: "ubuntu-desktop" }),
    );
    await assertSucceeds(getDoc(ref));
    await assertFails(getDoc(doc(dbAs(BOB), `users/${ALICE}/state/desktop`)));
  });

  test("rejects unknown desktop status and leave time fields", async () => {
    const ref = doc(dbAs(ALICE), `users/${ALICE}/state/desktop`);
    await assertFails(
      setDoc(ref, { status: "busy", heartbeatAt: serverTimestamp(), device: "pc" }),
    );
    await assertFails(
      setDoc(ref, {
        status: "idle",
        heartbeatAt: serverTimestamp(),
        device: "pc",
        leaveTime: Timestamp.now(),
      }),
    );
  });

  test("preferences store last-selected and next task", async () => {
    const ref = doc(dbAs(ALICE), `users/${ALICE}/state/preferences`);
    await assertSucceeds(
      setDoc(ref, { lastSelectedTaskId: "t1", nextTaskId: null, updatedAt: serverTimestamp() }),
    );
    await assertFails(setDoc(ref, { lastSelectedTaskId: 1, updatedAt: serverTimestamp() }));
  });

  test("other state documents are denied", async () => {
    await assertFails(setDoc(doc(dbAs(ALICE), `users/${ALICE}/state/other`), { a: 1 }));
  });
});
