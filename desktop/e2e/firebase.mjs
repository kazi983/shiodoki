// End-to-end test of the Firebase mode against the local emulators
// (TIMER_FIREBASE_EMULATOR=1 signs in with a fake Google account):
//
//   1. first launch shows the sign-in window; signing in copies the v1 tasks
//   2. tasks added on the PC reach Firestore; an "Android" edit reaches the PC
//   3. a session is recorded and users/{uid}/state/desktop follows the PC
//   4. after a restart the PC is still signed in (IndexedDB persistence)
//
// Run with `npm run e2e:firebase` (starts the emulators).

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { _electron as electron } from "playwright";
import { initializeApp } from "firebase/app";
import { GoogleAuthProvider, connectAuthEmulator, getAuth, signInWithCredential } from "firebase/auth";
import {
  collection,
  connectFirestoreEmulator,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  serverTimestamp,
  terminate,
  updateDoc,
} from "firebase/firestore";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const shots = join(root, "e2e", "screenshots");
mkdirSync(shots, { recursive: true });

// ---- the "Android" side: a plain Firebase client signed in as the same fake user ----
const phoneApp = initializeApp({ apiKey: "demo-key", projectId: "demo-30min-task-timer" }, "phone");
const phoneAuth = getAuth(phoneApp);
connectAuthEmulator(phoneAuth, "http://127.0.0.1:9099", { disableWarnings: true });
const { user } = await signInWithCredential(
  phoneAuth,
  GoogleAuthProvider.credential(JSON.stringify({ sub: "e2e-user", email: "e2e@example.com", email_verified: true })),
);
const phoneDb = getFirestore(phoneApp);
connectFirestoreEmulator(phoneDb, "127.0.0.1", 8080);
const base = `users/${user.uid}`;

async function poll(read, ok, what) {
  let last;
  for (let i = 0; i < 100; i++) {
    last = await read();
    if (ok(last)) return last;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`timed out waiting for ${what}: ${JSON.stringify(last)}`);
}

const remoteTasks = async () => (await getDocs(collection(phoneDb, `${base}/tasks`))).docs.map((d) => ({ id: d.id, ...d.data() }));
const desktopState = async () => (await getDoc(doc(phoneDb, `${base}/state/desktop`))).data();

// ---- v1 data on this "PC" ----
const configHome = mkdtempSync(join(tmpdir(), "timer-e2e-fb-"));
mkdirSync(join(configHome, "30min-task-timer"), { recursive: true });
writeFileSync(
  join(configHome, "30min-task-timer", "tasks_test.json"),
  JSON.stringify([
    { id: "legacy-1", name: "v1のタスク", priority: "SOONER", total_minutes: 95, completed_sessions: 3, last_selected: true },
    { id: "legacy-2", name: "v1の優先度なし", priority: "なし" },
  ]),
);

async function launch() {
  const app = await electron.launch({
    executablePath: require("electron"),
    args: [join(root, "out/main/index.js"), ...(process.getuid?.() === 0 ? ["--no-sandbox"] : [])],
    env: {
      ...process.env,
      TASK_MODE: "test",
      TIMER_FIREBASE_EMULATOR: "1",
      XDG_CONFIG_HOME: configHome,
      ELECTRON_RENDERER_URL: "",
    },
  });
  // Native dialogs cannot be clicked by Playwright: answer the first button (OK / コピーする).
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false });
  });
  return app;
}

async function windowFor(app, route) {
  for (let i = 0; i < 150; i++) {
    const page = app.windows().find((w) => !w.isClosed() && w.url().endsWith(`#${route}`));
    if (page) return page;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`window #${route} did not open`);
}

let app;
try {
  // ---- 1. first launch: sign in and migrate ----
  app = await launch();
  const login = await windowFor(app, "login");
  await login.waitForSelector("text=Google でログイン");
  await login.screenshot({ path: join(shots, "fb-1-login.png") });
  await login.click("text=Google でログイン");

  const picker = await windowFor(app, "picker");
  await picker.waitForSelector('.task-list .task-name:has-text("v1のタスク")');
  assert.match(await picker.locator(".picker-header .sub").textContent(), /前回の続き: v1のタスク/);
  const migrated = await poll(remoteTasks, (t) => t.length === 2, "migrated tasks");
  const v1 = migrated.find((t) => t.id === "legacy-1");
  assert.equal(v1.totalMinutes, 95);
  assert.equal(v1.updatedBy, "migration");
  assert.equal(migrated.find((t) => t.id === "legacy-2").priority, "SOMEDAY");

  // ---- 2. PC -> Firestore ----
  await picker.fill('input[aria-label="新しいタスク"]', "PCで追加");
  await picker.press('input[aria-label="新しいタスク"]', "Enter");
  const added = (await poll(remoteTasks, (t) => t.some((x) => x.name === "PCで追加"), "task from PC")).find(
    (x) => x.name === "PCで追加",
  );
  assert.equal(added.priority, "NOW");
  await poll(
    async () => picker.locator(".sync-badge").textContent(),
    (t) => t.includes("同期済み"),
    "synced badge",
  );

  // ---- 2b. "Android" -> PC (realtime) ----
  await updateDoc(doc(phoneDb, `${base}/tasks/legacy-2`), {
    name: "スマホで名前を変更",
    updatedAt: serverTimestamp(),
    updatedBy: "android",
  });
  await picker.waitForSelector('.task-list .task-name:has-text("スマホで名前を変更")');
  await picker.screenshot({ path: join(shots, "fb-2-picker-synced.png") });

  // ---- 3. session + PC status ----
  await picker.click('.task-list li:has-text("PCで追加")');
  await picker.fill('input[aria-label="退勤時刻"]', "2359");
  await picker.click("text=▶ はじめる");
  await windowFor(app, "overlay");
  const running = await poll(desktopState, (s) => s?.status === "running", "running state");
  assert.equal(running.currentTaskName, "PCで追加");
  assert.ok(running.nextPromptAt, "nextPromptAt is set");

  // TASK_MODE=test: the picker comes back after 5 seconds
  await poll(desktopState, (s) => s?.status === "idle", "idle state");
  const sessions = (await getDocs(collection(phoneDb, `${base}/sessions`))).docs.map((d) => d.data());
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].taskName, "PCで追加");
  assert.equal(sessions[0].endReason, "interval");
  await poll(
    async () => (await remoteTasks()).find((t) => t.name === "PCで追加")?.sessionCount,
    (n) => n === 1,
    "sessionCount",
  );

  await app.close();
  app = undefined;
  await poll(desktopState, (s) => s?.status === "stopped", "stopped state");

  // ---- 4. restart: still signed in, no login window ----
  app = await launch();
  const picker2 = await windowFor(app, "picker");
  await picker2.waitForSelector('.task-list .task-name:has-text("スマホで名前を変更")');
  assert.ok(!app.windows().some((w) => w.url().endsWith("#login")), "login window must not open");
  await picker2.screenshot({ path: join(shots, "fb-3-after-restart.png") });

  console.log("Firebase E2E test passed. Screenshots:", shots);
} finally {
  await app?.close().catch(() => {});
  await terminate(phoneDb).catch(() => {});
  rmSync(configHome, { recursive: true, force: true });
}
process.exit(0);
