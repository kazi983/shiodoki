// End-to-end smoke test (local mode, TIMER_LOCAL=1): launches the built app with Playwright, loads a
// seeded local store, adds a task, runs a (5 second) session and checks that the
// picker comes back and the time was recorded. Then relaunches with the language setting
// (settings.json) set to English and checks the translated UI. Saves screenshots to e2e/screenshots/.
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
const dataDir = join(configHome, "shiodoki");
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
      seedTask({ id: "local-1", name: "既存タスク", priority: "SOONER", totalMinutes: 95, sessionCount: 3 }),
      seedTask({ id: "local-2", name: "いつかのタスク", priority: "SOMEDAY", createdAt: "2026-09-02T10:00:00.000Z" }),
      seedTask({
        id: "local-3",
        name: "完了済みタスク",
        priority: "NOW",
        completed: true,
        completedAt: "2026-09-03T10:00:00.000Z",
      }),
      seedTask({ id: "local-4", name: "削除済みタスク", priority: "NOW", deleted: true }),
    ],
    sessions: [],
    preferences: { lastSelectedTaskId: "local-1", nextTaskId: null },
  }),
);

/**
 * SHIODOKI_LOCALE fixes the UI language whatever the OS language is; an empty value leaves it
 * to settings.json.
 */
async function launch(locale, extraEnv = {}) {
  const launched = await electron.launch({
    executablePath: require("electron"),
    args: [
      join(root, "out/main/index.js"),
      "--ozone-platform=x11",
      ...(process.getuid?.() === 0 ? ["--no-sandbox"] : []),
    ],
    env: {
      ...process.env,
      TASK_MODE: "test",
      TIMER_LOCAL: "1",
      SHIODOKI_LOCALE: locale,
      XDG_CONFIG_HOME: configHome,
      ELECTRON_RENDERER_URL: "",
      ...extraEnv,
    },
  });
  // Native confirm dialogs cannot be clicked by Playwright: always answer "OK".
  await launched.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false });
  });
  return launched;
}

let app = await launch("ja");

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
  // ---- picker with the seeded tasks ----
  const picker = await windowFor("picker");
  await picker.waitForSelector(".task-list [role=option]");
  const names = await picker.locator(".task-list .task-name").allTextContents();
  assert.deepEqual(names, ["既存タスク", "いつかのタスク"]);
  assert.match(await picker.locator(".resume-card").textContent(), /前回の続き既存タスク累計 1h 35m · 3 セッション/);
  assert.deepEqual(await picker.locator(".group-label").allTextContents(), ["SOON近いうち", "SOMEDAYいつか"]);
  await picker.screenshot({ path: join(shots, "1-picker.png") });

  // ---- add from the picker ----
  await picker.fill('input[aria-label="新しいタスク"]', "E2Eで追加したタスク");
  await picker.press('input[aria-label="新しいタスク"]', "Enter");
  await picker.waitForSelector('.task-list [aria-selected=true]:has-text("E2Eで追加したタスク")');

  // ---- management ----
  await picker.click("text=タスク管理");
  const management = await windowFor("management");
  await waitClosed("picker");
  await management.waitForSelector(".task-table tbody tr");
  const rows = await management.locator(".task-table tbody tr").count();
  assert.equal(rows, 4, "3 seeded (1 completed) + 1 added; deleted one is skipped");
  await management.click('tr:has-text("いつかのタスク")');
  assert.equal(await management.getAttribute(".prio-option[aria-pressed=true]", "title"), "SOMEDAY");
  // Autosave: a priority click saves at once, typing saves after a pause.
  await management.click('.prio-option[title="ANYTIME"]');
  await management.waitForSelector('tr:has-text("いつかのタスク") .prio-chip:has-text("いつでも")');
  await management.fill('textarea[aria-label="メモ"]', "メモも保存される");
  await management.waitForSelector('.save-status:has-text("未保存の変更")');
  await management.waitForSelector('.cell-memo:has-text("メモも保存される")');
  await management.waitForSelector('.save-status:has-text("保存済み")');
  await management.fill('input[aria-label="タスクを検索"]', "メモも");
  assert.equal(await management.locator(".task-table tbody tr").count(), 1, "search matches the memo");
  await management.fill('input[aria-label="タスクを検索"]', "");
  await management.screenshot({ path: join(shots, "2-management.png") });

  // Leaving before the pause is over still saves (checked in the store below).
  await management.fill('textarea[aria-label="メモ"]', "戻るときに保存される");

  // ---- back to picker, start a session (TASK_MODE=test: 5 second interval) ----
  await management.click('button[aria-label="Quick Start に戻る"]');
  const picker2 = await windowFor("picker");
  await picker2.waitForSelector('.task-list [role=option]:has-text("E2Eで追加したタスク")');
  await picker2.click('.task-list [role=option]:has-text("E2Eで追加したタスク")');
  await picker2.fill('input[aria-label="次の予定の時刻"]', "2359");
  await picker2.click(".start-btn");
  const overlay = await windowFor("overlay");
  await waitClosed("picker");
  await overlay.waitForSelector(".overlay-tab");
  await overlay.screenshot({ path: join(shots, "3-overlay.png") });

  // ---- after the interval the picker returns ----
  const picker3 = await windowFor("picker");
  await picker3.waitForSelector('.leave-row:has-text("23:59")');
  await picker3.screenshot({ path: join(shots, "4-picker-after-session.png") });

  const store = JSON.parse(readFileSync(join(dataDir, "store_test.json"), "utf8"));
  assert.equal(store.sessions.length, 1);
  assert.equal(store.sessions[0].endReason, "interval");
  assert.equal(store.sessions[0].taskName, "E2Eで追加したタスク");
  assert.equal(store.tasks.find((t) => t.name === "E2Eで追加したタスク").sessionCount, 1);
  assert.equal(store.tasks.find((t) => t.name === "いつかのタスク").memo, "戻るときに保存される");

  // ---- English UI from the language setting: same data, translated text ----
  await app.close();
  writeFileSync(join(dataDir, "settings.json"), JSON.stringify({ language: "en" }));
  // The OS says Japanese, so English can only come from the setting.
  app = await launch("", { LANG: "ja_JP.UTF-8", LANGUAGE: "ja" });
  assert.match(await app.evaluate(({ app: electronApp }) => electronApp.getLocale()), /^ja/);
  const pickerEn = await windowFor("picker");
  await pickerEn.waitForSelector(".task-list [role=option]");
  assert.equal(await pickerEn.locator("h1").textContent(), "What's your focus now?");
  assert.equal(await pickerEn.evaluate(() => document.documentElement.lang), "en");
  assert.match(await pickerEn.locator(".resume-card").textContent(), /Continue last task.* · 1 session(?!s)/);
  // English shows only the priority key in group headings.
  assert.deepEqual(await pickerEn.locator(".group-label").allTextContents(), ["NOW", "SOON", "ANYTIME"]);
  await pickerEn.screenshot({ path: join(shots, "5-picker-en.png") });

  await pickerEn.click("text=Manage tasks");
  const managementEn = await windowFor("management");
  await managementEn.waitForSelector(".task-table tbody tr");
  assert.equal(await managementEn.locator('tr:has-text("既存タスク") .cell-date').textContent(), "Sep 1");
  assert.equal(await managementEn.locator('tr:has-text("既存タスク") .prio-chip').textContent(), "Soon");
  await managementEn.screenshot({ path: join(shots, "6-management-en.png") });

  console.log("E2E smoke test passed. Screenshots:", shots);
} finally {
  await app.close().catch(() => {});
  rmSync(configHome, { recursive: true, force: true });
}
