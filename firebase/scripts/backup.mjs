// Read-only backup of one user's Shiodoki data from Firestore (plan Q15, docs/e2ee/design.md §7).
//
//   node scripts/backup.mjs --email you@gmail.com --out ~/shiodoki-backup-2026-10-29
//
// Writes two files into a new directory:
//   store.json  the desktop local-mode format (tasks, sessions, preferences) with plain text names. Put it in place as
//               the local store and sign in: the first sign-in copy encrypts and uploads it (requirements D-07).
//   raw.json    every document of the user exactly as stored (ciphertext stays ciphertext), as a safety net.
//
// Credentials: Application Default Credentials (`gcloud auth application-default login`), no service account key.
// The Admin SDK bypasses the security rules, but this script never writes to Firestore.
// Encrypted values ("e1:…") need the passphrase: SHIODOKI_PASSPHRASE, or typed at the prompt.
// Task names are never printed.

import { createDecipheriv, pbkdf2Sync } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { Timestamp, getFirestore } from "firebase-admin/firestore";

export const PROJECT_ID = "shiodoki-e4e8f";
const PRIORITIES = ["NOW", "ROUTINE", "SOONER", "ANYTIME", "SOMEDAY", "BREAK"];

/** Reads everything of `uid` and returns { raw, store, counts }. `passphrase` is asked only if something is encrypted. */
export async function backup(db, uid, askPassphrase) {
  const user = db.doc(`users/${uid}`);
  const [tasksSnap, sessionsSnap, stateSnap] = await Promise.all([
    user.collection("tasks").get(),
    user.collection("sessions").get(),
    user.collection("state").get(),
  ]);
  const state = Object.fromEntries(stateSnap.docs.map((d) => [d.id, d.data()]));
  const raw = {
    uid,
    exportedAt: new Date().toISOString(),
    tasks: Object.fromEntries(tasksSnap.docs.map((d) => [d.id, toJson(d.data())])),
    sessions: Object.fromEntries(sessionsSnap.docs.map((d) => [d.id, toJson(d.data())])),
    state: toJson(state),
  };

  const values = [
    ...tasksSnap.docs.flatMap((d) => [d.data().name, d.data().memo]),
    ...sessionsSnap.docs.map((d) => d.data().taskName),
  ];
  const encrypted = values.filter((v) => typeof v === "string" && v.startsWith("e1:")).length;
  let open = (value) => value;
  if (encrypted > 0) {
    if (!state.keys) throw new Error(`${encrypted} values are encrypted, but state/keys is missing`);
    const dek = unwrap(state.keys, await askPassphrase());
    open = (value) =>
      typeof value === "string" && value.startsWith("e1:") ? decrypt(dek, value).toString("utf8") : value;
  }

  const tasks = tasksSnap.docs.map((d) => toTask(d.id, d.data(), open));
  const sessions = sessionsSnap.docs
    .map((d) => toSession(d.id, d.data(), open))
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const prefs = state.preferences ?? {};
  const store = {
    version: 1,
    tasks,
    sessions,
    preferences: {
      lastSelectedTaskId: typeof prefs.lastSelectedTaskId === "string" ? prefs.lastSelectedTaskId : null,
      nextTaskId: typeof prefs.nextTaskId === "string" ? prefs.nextTaskId : null,
    },
  };
  return {
    raw,
    store,
    counts: {
      tasks: tasks.length,
      deletedTasks: tasks.filter((t) => t.deleted).length,
      sessions: sessions.length,
      encryptedValues: encrypted,
    },
  };
}

// ---- conversion to the desktop models (desktop/src/shared/task.ts, session.ts) ----

function iso(value, fallback) {
  return value instanceof Timestamp ? value.toDate().toISOString() : fallback;
}

function toTask(id, d, open) {
  const now = new Date().toISOString();
  return {
    id,
    name: open(typeof d.name === "string" ? d.name : ""),
    memo: open(typeof d.memo === "string" ? d.memo : ""),
    priority: PRIORITIES.includes(d.priority) ? d.priority : "SOMEDAY",
    completed: d.completed === true,
    completedAt: d.completedAt instanceof Timestamp ? d.completedAt.toDate().toISOString() : null,
    deleted: d.deleted === true,
    totalMinutes: typeof d.totalMinutes === "number" ? d.totalMinutes : 0,
    sessionCount: typeof d.sessionCount === "number" ? d.sessionCount : 0,
    createdAt: iso(d.createdAt, now),
    updatedAt: iso(d.updatedAt, now),
    updatedBy: ["android", "migration"].includes(d.updatedBy) ? d.updatedBy : "desktop",
    ...(typeof d.sortOrder === "number" && Number.isFinite(d.sortOrder) ? { sortOrder: d.sortOrder } : {}),
  };
}

function toSession(id, d, open) {
  const epoch = new Date(0).toISOString();
  return {
    id,
    taskId: typeof d.taskId === "string" ? d.taskId : "",
    taskName: open(typeof d.taskName === "string" ? d.taskName : ""),
    startedAt: iso(d.startedAt, epoch),
    endedAt: iso(d.endedAt, epoch),
    elapsedMinutes: typeof d.elapsedMinutes === "number" ? d.elapsedMinutes : 0,
    endReason: d.endReason,
    device: typeof d.device === "string" ? d.device : "",
  };
}

/** Firestore values to plain JSON: Timestamps become ISO strings. */
function toJson(value) {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(toJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toJson(v)]));
  }
  return value;
}

// ---- decryption (docs/e2ee/design.md §4) ----

/** "e1:" + base64(iv 12 ‖ ciphertext ‖ tag 16), AES-256-GCM. Throws on a wrong key. */
function decrypt(key, value) {
  const bytes = Buffer.from(value.slice(3), "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(0, 12));
  decipher.setAuthTag(bytes.subarray(bytes.length - 16));
  return Buffer.concat([decipher.update(bytes.subarray(12, bytes.length - 16)), decipher.final()]);
}

function unwrap(keys, passphrase) {
  const { salt, iterations, wrappedKey } = keys.passphrase;
  const kek = pbkdf2Sync(passphrase.normalize("NFC"), Buffer.from(salt, "base64"), iterations, 32, "sha256");
  try {
    return decrypt(kek, wrappedKey);
  } catch {
    throw new Error("Wrong passphrase");
  }
}

// ---- command line ----

/** Reads a line without echoing it. */
function promptHidden(question) {
  return new Promise((resolvePromise) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (text) => {
      if (text.startsWith(question)) rl.output.write(text);
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolvePromise(answer);
    });
  });
}

async function main() {
  const { values } = parseArgs({
    options: { email: { type: "string" }, uid: { type: "string" }, out: { type: "string" } },
  });
  if ((!values.email && !values.uid) || !values.out) {
    console.error("Usage: node scripts/backup.mjs (--email <address> | --uid <uid>) --out <new directory>");
    process.exit(2);
  }
  const out = resolve(values.out);
  if (existsSync(join(out, "store.json")) || existsSync(join(out, "raw.json"))) {
    console.error(`${out} already has a backup; choose a new directory.`);
    process.exit(2);
  }

  const app = initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
  const uid = values.uid ?? (await getAuth(app).getUserByEmail(values.email)).uid;
  console.log(`Project ${PROJECT_ID}, user ${uid}`);

  const result = await backup(getFirestore(app), uid, async () => {
    return process.env.SHIODOKI_PASSPHRASE ?? (await promptHidden("Some values are encrypted. Passphrase: "));
  });

  mkdirSync(out, { recursive: true, mode: 0o700 });
  // Personal data in plain text: readable by this user only.
  writeFileSync(join(out, "raw.json"), JSON.stringify(result.raw, null, 2) + "\n", { mode: 0o600 });
  writeFileSync(join(out, "store.json"), JSON.stringify(result.store, null, 2) + "\n", { mode: 0o600 });
  const c = result.counts;
  console.log(
    `Saved ${c.tasks} tasks (${c.deletedTasks} deleted) and ${c.sessions} sessions` +
      (c.encryptedValues > 0 ? `, ${c.encryptedValues} values decrypted` : "") +
      ` to ${out}`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
