// End-to-end test of the Firebase mode against the local emulators
// (TIMER_FIREBASE_EMULATOR=1 signs in with a fake Google account):
//
//   1. first launch shows the welcome window; signing in sets up the encryption (passphrase, recovery key), then
//      copies the local-mode tasks and sessions
//   2. tasks added on the PC reach Firestore encrypted; an encrypted "Android" edit reaches the PC
//   3. a session is recorded and users/{uid}/state/desktop follows the PC
//   4. after a restart the PC is still signed in and unlocked (IndexedDB persistence, safeStorage)
//   5. another PC unlocks with the recovery key after a wrong passphrase
//
// The "Android" side decrypts with its own few lines of node:crypto, as the Android app will (docs/e2ee/design.md).
//
// Run with `npm run e2e:firebase` (starts the emulators).

import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
const phoneApp = initializeApp({ apiKey: "demo-key", projectId: "demo-shiodoki" }, "phone");
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

// ---- end-to-end encryption on the "Android" side ----
const PASSPHRASE = "e2e-passphrase-潮時";
let phoneKey = null;

async function dataKey() {
  if (phoneKey) return phoneKey;
  const { passphrase } = (await getDoc(doc(phoneDb, `${base}/state/keys`))).data();
  const kek = pbkdf2Sync(
    PASSPHRASE.normalize("NFC"),
    Buffer.from(passphrase.salt, "base64"),
    passphrase.iterations,
    32,
    "sha256",
  );
  phoneKey = open(kek, passphrase.wrappedKey);
  return phoneKey;
}

/** "e1:" + base64(iv 12 ‖ ciphertext ‖ tag 16), AES-256-GCM. */
function open(key, value) {
  assert.match(value, /^e1:/);
  const bytes = Buffer.from(value.slice(3), "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(0, 12));
  decipher.setAuthTag(bytes.subarray(bytes.length - 16));
  return Buffer.concat([decipher.update(bytes.subarray(12, bytes.length - 16)), decipher.final()]);
}

function seal(key, text) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return "e1:" + Buffer.concat([iv, body, cipher.getAuthTag()]).toString("base64");
}

const decrypt = async (value) => open(await dataKey(), value).toString("utf8");

/** Tasks with their names decrypted; `rawName` is what Firestore holds. */
const remoteTasks = async () =>
  Promise.all(
    (await getDocs(collection(phoneDb, `${base}/tasks`))).docs.map(async (d) => {
      const data = d.data();
      return { id: d.id, ...data, rawName: data.name, name: await decrypt(data.name) };
    }),
  );
const desktopState = async () => (await getDoc(doc(phoneDb, `${base}/state/desktop`))).data();

// ---- local-mode data on this "PC" (userData is shiodoki-emulator/ with TIMER_FIREBASE_EMULATOR=1) ----
const configHome = mkdtempSync(join(tmpdir(), "timer-e2e-fb-"));
const otherPcHome = mkdtempSync(join(tmpdir(), "timer-e2e-fb-pc2-"));
const dataDir = join(configHome, "shiodoki-emulator");
mkdirSync(dataDir, { recursive: true });
const seedTask = (fields) => ({
  memo: "",
  completed: false,
  completedAt: null,
  deleted: false,
  totalMinutes: 0,
  sessionCount: 0,
  createdAt: "2026-09-01T10:00:00.000Z",
  updatedAt: "2026-09-01T10:00:00.000Z",
  updatedBy: "desktop",
  ...fields,
});
writeFileSync(
  join(dataDir, "store_test.json"),
  JSON.stringify({
    version: 1,
    tasks: [
      seedTask({ id: "local-1", name: "ローカルのタスク", priority: "SOONER", totalMinutes: 95, sessionCount: 3 }),
      seedTask({ id: "local-2", name: "ローカルのいつか", priority: "SOMEDAY" }),
    ],
    sessions: [
      {
        id: "local-s1",
        taskId: "local-1",
        taskName: "ローカルのタスク",
        startedAt: "2026-09-01T10:00:00.000Z",
        endedAt: "2026-09-01T10:30:00.000Z",
        elapsedMinutes: 30,
        endReason: "interval",
        device: "old-pc",
      },
    ],
    preferences: { lastSelectedTaskId: "local-1", nextTaskId: null },
  }),
);

async function launch(home = configHome) {
  const app = await electron.launch({
    executablePath: require("electron"),
    args: [
      join(root, "out/main/index.js"),
      "--ozone-platform=x11",
      // safeStorage without the desktop keyring, so the test never prompts and runs headless.
      "--password-store=basic",
      ...(process.getuid?.() === 0 ? ["--no-sandbox"] : []),
    ],
    env: {
      ...process.env,
      TASK_MODE: "test",
      TIMER_FIREBASE_EMULATOR: "1",
      // The assertions use the Japanese UI text, whatever the OS language.
      SHIODOKI_LOCALE: "ja",
      XDG_CONFIG_HOME: home,
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
  const welcome = await windowFor(app, "welcome");
  await welcome.waitForSelector("text=Google でログインして同期");
  await welcome.screenshot({ path: join(shots, "fb-1-welcome.png") });
  await welcome.click("text=Google でログインして同期");

  const setup = await windowFor(app, "encryption-setup");
  await setup.locator("input").nth(0).fill(PASSPHRASE);
  await setup.locator("input").nth(1).fill(PASSPHRASE);
  await setup.screenshot({ path: join(shots, "fb-1b-passphrase.png") });
  await setup.click("text=次へ");
  await setup.waitForSelector(".recovery-groups");
  const recoveryKey = (await setup.locator(".recovery-groups span").allTextContents()).join("-");
  assert.match(recoveryKey, /^([0-9A-Z]{4}-){7}[0-9A-Z]{4}$/);
  await setup.screenshot({ path: join(shots, "fb-1c-recovery-key.png") });
  await setup.check("input[type=checkbox]");
  await setup.click("text=完了");

  const picker = await windowFor(app, "picker");
  await picker.waitForSelector('.task-list .task-name:has-text("ローカルのタスク")');
  assert.match(await picker.locator(".resume-card").textContent(), /前回の続きローカルのタスク/);
  const migrated = await poll(remoteTasks, (t) => t.length === 2, "migrated tasks");
  const first = migrated.find((t) => t.id === "local-1");
  assert.equal(first.name, "ローカルのタスク");
  assert.ok(!first.rawName.includes("ローカル"), "the name is stored encrypted");
  assert.equal(first.totalMinutes, 95);
  assert.equal(first.updatedBy, "migration");
  assert.equal(migrated.find((t) => t.id === "local-2").priority, "SOMEDAY");
  assert.ok(existsSync(join(dataDir, "store_test.json.migrated")), "local store is renamed after the copy");
  const copiedSession = await poll(
    async () => (await getDoc(doc(phoneDb, `${base}/sessions/local-s1`))).data(),
    (s) => s !== undefined,
    "migrated session",
  );
  assert.equal(copiedSession.elapsedMinutes, 30);
  assert.equal(await decrypt(copiedSession.taskName), "ローカルのタスク");
  const keysDoc = JSON.stringify((await getDoc(doc(phoneDb, `${base}/state/keys`))).data());
  assert.ok(!keysDoc.includes(PASSPHRASE) && !keysDoc.includes(recoveryKey), "no secret in state/keys");

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
  await updateDoc(doc(phoneDb, `${base}/tasks/local-2`), {
    name: seal(await dataKey(), "スマホで名前を変更"),
    updatedAt: serverTimestamp(),
    updatedBy: "android",
  });
  await picker.waitForSelector('.task-list .task-name:has-text("スマホで名前を変更")');
  await picker.screenshot({ path: join(shots, "fb-2-picker-synced.png") });

  // ---- 3. session + PC status ----
  await picker.click('.task-list [role=option]:has-text("PCで追加")');
  await picker.fill('input[aria-label="次の予定の時刻"]', "2359");
  await picker.click(".start-btn");
  await windowFor(app, "overlay");
  const running = await poll(desktopState, (s) => s?.status === "running", "running state");
  assert.equal(await decrypt(running.currentTaskName), "PCで追加");
  assert.ok(running.nextPromptAt, "nextPromptAt is set");

  // TASK_MODE=test: the picker comes back after 5 seconds
  await poll(desktopState, (s) => s?.status === "idle", "idle state");
  const sessions = await poll(
    async () => (await getDocs(collection(phoneDb, `${base}/sessions`))).docs.map((d) => d.data()),
    (s) => s.length >= 2,
    "session record",
  );
  assert.equal(sessions.length, 2);
  sessions.sort((a, b) => b.endedAt.toMillis() - a.endedAt.toMillis());
  assert.equal(await decrypt(sessions[0].taskName), "PCで追加");
  assert.equal(sessions[0].endReason, "interval");
  await poll(
    async () => (await remoteTasks()).find((t) => t.name === "PCで追加")?.sessionCount,
    (n) => n === 1,
    "sessionCount",
  );

  await app.close();
  app = undefined;
  await poll(desktopState, (s) => s?.status === "stopped", "stopped state");

  // ---- 4. restart: still signed in, no welcome window ----
  app = await launch();
  const picker2 = await windowFor(app, "picker");
  await picker2.waitForSelector('.task-list .task-name:has-text("スマホで名前を変更")');
  assert.ok(
    !app.windows().some((w) => /#(welcome|unlock|encryption-setup)$/.test(w.url())),
    "no sign-in or unlock window after a restart",
  );
  await picker2.screenshot({ path: join(shots, "fb-3-after-restart.png") });
  await app.close();
  app = undefined;

  // ---- 5. another PC: wrong passphrase, then the recovery key ----
  app = await launch(otherPcHome);
  const welcome2 = await windowFor(app, "welcome");
  await welcome2.click("text=Google でログインして同期");
  const unlock = await windowFor(app, "unlock");
  await unlock.waitForSelector("text=e2e@example.com");
  await unlock.locator("input").fill("not-the-passphrase");
  await unlock.click("button[type=submit]");
  await unlock.waitForSelector("text=パスフレーズが正しくありません");
  await unlock.screenshot({ path: join(shots, "fb-4-unlock-wrong.png") });
  await unlock.click('[role=tab]:has-text("回復キー")');
  await unlock.locator("input").fill(recoveryKey.toLowerCase().replace(/-/g, ""));
  await unlock.click("button[type=submit]");
  const picker3 = await windowFor(app, "picker");
  await picker3.waitForSelector('.task-list .task-name:has-text("スマホで名前を変更")');
  await picker3.waitForSelector('.task-list .task-name:has-text("PCで追加")');

  console.log("Firebase E2E test passed. Screenshots:", shots);
} finally {
  await app?.close().catch(() => {});
  await terminate(phoneDb).catch(() => {});
  rmSync(configHome, { recursive: true, force: true });
  rmSync(otherPcHome, { recursive: true, force: true });
}
process.exit(0);
