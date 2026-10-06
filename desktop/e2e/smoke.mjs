// End-to-end smoke test: launches the built app with Playwright, imports a
// v1 tasks.json, adds a task, runs a (5 second) session and checks that the
// picker comes back and the time was recorded. Saves screenshots to
// e2e/screenshots/.
//
//   npm run build && node e2e/smoke.mjs          (on a desktop)
//   npm run build && xvfb-run -a node e2e/smoke.mjs   (headless Linux)

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { _electron as electron } from "playwright";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const shots = join(root, "e2e", "screenshots");
mkdirSync(shots, { recursive: true });

const configHome = mkdtempSync(join(tmpdir(), "timer-e2e-"));
const legacyDir = join(configHome, "30min-task-timer");
mkdirSync(legacyDir, { recursive: true });
writeFileSync(
  join(legacyDir, "tasks_test.json"),
  JSON.stringify([
    { id: "legacy-1", name: "既存タスク（v1から移行）", priority: "SOONER", total_minutes: 95, completed_sessions: 3, created_at: "2026-09-01T10:00:00+00:00", last_selected: true },
    { id: "legacy-2", name: "優先度なしのタスク", priority: "なし", created_at: "2026-09-02T10:00:00+00:00" },
    { id: "legacy-3", name: "完了済みタスク", priority: "NOW", completed: true, created_at: "2026-09-03T10:00:00+00:00" },
    { id: "legacy-4", name: "削除済みタスク", priority: "NOW", deleted: true },
  ]),
);

const app = await electron.launch({
  executablePath: require("electron"),
  args: [join(root, "out/main/index.js"), ...(process.getuid?.() === 0 ? ["--no-sandbox"] : [])],
  env: { ...process.env, TASK_MODE: "test", XDG_CONFIG_HOME: configHome, ELECTRON_RENDERER_URL: "" },
});

async function windowFor(route) {
  for (let i = 0; i < 100; i++) {
    const page = app.windows().find((w) => !w.isClosed() && w.url().endsWith(`#${route}`));
    if (page) return page;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`window #${route} did not open`);
}

async function waitClosed(route) {
  for (let i = 0; i < 100; i++) {
    if (!app.windows().some((w) => !w.isClosed() && w.url().endsWith(`#${route}`))) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`window #${route} did not close`);
}

try {
  // Native confirm dialogs cannot be clicked by Playwright: always answer "OK".
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false });
  });

  // ---- picker with imported v1 tasks ----
  const picker = await windowFor("picker");
  await picker.waitForSelector(".task-list li[role=option]");
  const names = await picker.locator(".task-list .task-name").allTextContents();
  assert.deepEqual(names, ["既存タスク（v1から移行）", "優先度なしのタスク"]);
  assert.match(await picker.locator(".picker-header .sub").textContent(), /前回の続き: 既存タスク/);
  await picker.screenshot({ path: join(shots, "1-picker.png") });

  // ---- add from the picker ----
  await picker.fill('input[aria-label="新しいタスク"]', "E2Eで追加したタスク");
  await picker.press('input[aria-label="新しいタスク"]', "Enter");
  await picker.waitForSelector('.task-list li[aria-selected=true]:has-text("E2Eで追加したタスク")');

  // ---- management ----
  await picker.click("text=編集");
  const management = await windowFor("management");
  await waitClosed("picker");
  await management.waitForSelector(".task-table tbody tr");
  const rows = await management.locator(".task-table tbody tr").count();
  assert.equal(rows, 4, "3 imported (1 completed) + 1 added; deleted one is skipped");
  await management.click('tr:has-text("優先度なしのタスク")');
  assert.equal(await management.inputValue('select[aria-label="優先度"]'), "SOMEDAY");
  await management.fill('input[aria-label="メモ"]', "メモも保存される");
  await management.click("text=更新");
  await management.waitForSelector('td:has-text("メモも保存される")');
  await management.screenshot({ path: join(shots, "2-management.png") });

  // ---- back to picker, start a session (TASK_MODE=test: 5 second interval) ----
  await management.click("text=戻る");
  const picker2 = await windowFor("picker");
  await picker2.waitForSelector('.task-list li:has-text("E2Eで追加したタスク")');
  await picker2.click('.task-list li:has-text("E2Eで追加したタスク")');
  await picker2.fill('input[aria-label="退勤時刻"]', "2359");
  await picker2.click("text=▶ はじめる");
  const overlay = await windowFor("overlay");
  await waitClosed("picker");
  await overlay.screenshot({ path: join(shots, "3-overlay.png") });

  // ---- after the interval the picker returns ----
  const picker3 = await windowFor("picker");
  await picker3.waitForSelector(".leave-row");
  await picker3.screenshot({ path: join(shots, "4-picker-after-session.png") });

  const store = JSON.parse(
    readFileSync(join(configHome, "30min-task-timer-v2", "store_test.json"), "utf8"),
  );
  assert.equal(store.sessions.length, 1);
  assert.equal(store.sessions[0].endReason, "interval");
  assert.equal(store.sessions[0].taskName, "E2Eで追加したタスク");
  assert.equal(store.tasks.find((t) => t.name === "E2Eで追加したタスク").sessionCount, 1);

  console.log("E2E smoke test passed. Screenshots:", shots);
} finally {
  await app.close().catch(() => {});
  rmSync(configHome, { recursive: true, force: true });
}
