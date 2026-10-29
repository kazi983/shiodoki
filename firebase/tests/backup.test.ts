/**
 * scripts/backup.mjs against the Firestore emulator (started by `npm test`), with the Admin SDK like the real run.
 * The data mixes plain text written before encryption and values encrypted like the apps do.
 */
import { createCipheriv, pbkdf2Sync, randomBytes } from "node:crypto";
import { afterAll, describe, expect, test } from "vitest";
import { deleteApp, initializeApp } from "firebase-admin/app";
import { Timestamp, getFirestore } from "firebase-admin/firestore";
// @ts-expect-error -- plain JavaScript script without type declarations
import { backup } from "../scripts/backup.mjs";

// Its own project, so the rules tests clearing "demo-shiodoki" do not interfere.
const app = initializeApp({ projectId: "demo-backup" }, "backup-test");
const db = getFirestore(app);
const UID = "kazi";
const PASSPHRASE = "kaze-no-tayori-潮時";

afterAll(async () => {
  await deleteApp(app);
});

function seal(key: Buffer, data: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  return "e1:" + Buffer.concat([iv, cipher.update(data), cipher.final(), cipher.getAuthTag()]).toString("base64");
}

const at = (iso: string) => Timestamp.fromDate(new Date(iso));

async function seed(encrypted: boolean) {
  const user = db.doc(`users/${UID}`);
  const dek = randomBytes(32);
  const name = (plain: string) => (encrypted ? seal(dek, Buffer.from(plain)) : plain);
  if (encrypted) {
    const salt = randomBytes(16);
    const kek = pbkdf2Sync(PASSPHRASE.normalize("NFC"), salt, 1000, 32, "sha256");
    await user
      .collection("state")
      .doc("keys")
      .set({
        v: 1,
        passphrase: {
          kdf: "PBKDF2-SHA256",
          iterations: 1000,
          salt: salt.toString("base64"),
          wrappedKey: seal(kek, dek),
        },
        recovery: { kdf: "HKDF-SHA256", salt: "AA==", wrappedKey: "e1:AA==" },
        updatedAt: Timestamp.now(),
      });
  }
  const task = {
    memo: "",
    priority: "NOW",
    completed: false,
    completedAt: null,
    deleted: false,
    totalMinutes: 90,
    sessionCount: 3,
    createdAt: at("2026-10-01T09:00:00Z"),
    updatedAt: at("2026-10-02T09:00:00Z"),
    updatedBy: "desktop",
  };
  // Written before encryption: plain text stays readable without the passphrase.
  await user
    .collection("tasks")
    .doc("old")
    .set({ ...task, name: "古いタスク", memo: "平文のメモ", sortOrder: 1000 });
  await user
    .collection("tasks")
    .doc("new")
    .set({ ...task, name: name("新しいタスク"), memo: name("暗号化したメモ"), updatedBy: "android", deleted: true });
  await user
    .collection("sessions")
    .doc("s1")
    .set({
      taskId: "new",
      taskName: name("新しいタスク"),
      startedAt: at("2026-10-03T09:00:00Z"),
      endedAt: at("2026-10-03T09:30:00Z"),
      elapsedMinutes: 30,
      endReason: "screen_off",
      device: "Pixel 8",
    });
  await user.collection("state").doc("preferences").set({ lastSelectedTaskId: "old", updatedAt: Timestamp.now() });
}

async function clear() {
  await db.recursiveDelete(db.doc(`users/${UID}`));
}

describe("backup", () => {
  test("plain data: the local store format, no passphrase asked", async () => {
    await clear();
    await seed(false);
    const { store, raw, counts } = await backup(db, UID, async () => {
      throw new Error("must not ask");
    });
    expect(counts).toEqual({ tasks: 2, deletedTasks: 1, sessions: 1, encryptedValues: 0 });
    expect(store.version).toBe(1);
    expect(store.preferences).toEqual({ lastSelectedTaskId: "old", nextTaskId: null });
    expect(store.tasks.find((t: { id: string }) => t.id === "old")).toEqual({
      id: "old",
      name: "古いタスク",
      memo: "平文のメモ",
      priority: "NOW",
      completed: false,
      completedAt: null,
      deleted: false,
      totalMinutes: 90,
      sessionCount: 3,
      createdAt: "2026-10-01T09:00:00.000Z",
      updatedAt: "2026-10-02T09:00:00.000Z",
      updatedBy: "desktop",
      sortOrder: 1000,
    });
    expect(store.sessions[0]).toMatchObject({ id: "s1", taskName: "新しいタスク", endReason: "screen_off" });
    expect(raw.tasks.old.createdAt).toBe("2026-10-01T09:00:00.000Z");
  });

  test("mixed data: encrypted values are decrypted with the passphrase, raw keeps the ciphertext", async () => {
    await clear();
    await seed(true);
    const { store, raw, counts } = await backup(db, UID, async () => PASSPHRASE);
    expect(counts.encryptedValues).toBe(3);
    const created = store.tasks.find((t: { id: string }) => t.id === "new");
    expect(created).toMatchObject({
      name: "新しいタスク",
      memo: "暗号化したメモ",
      deleted: true,
      updatedBy: "android",
    });
    expect(store.tasks.find((t: { id: string }) => t.id === "old").name).toBe("古いタスク");
    expect(store.sessions[0].taskName).toBe("新しいタスク");
    expect(raw.tasks.new.name).toMatch(/^e1:/);
    expect(raw.state.keys.passphrase.iterations).toBe(1000);
  });

  test("a wrong passphrase stops the backup", async () => {
    await clear();
    await seed(true);
    await expect(backup(db, UID, async () => "wrong")).rejects.toThrow("Wrong passphrase");
  });
});
