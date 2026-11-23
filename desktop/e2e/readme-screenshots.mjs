// Takes the screenshots shown in the top-level README (docs/images/). Runs the built app in local mode
// (TIMER_LOCAL=1) and in English with sample tasks, outside test mode so no TEST MODE badge shows.
// Takes about 7 minutes: it waits for real time to pass to capture the leave warning and the block screen.
//
//   npm run build && xvfb-run -a -s "-screen 0 1920x1080x24" node e2e/readme-screenshots.mjs

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "playwright";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "..", "docs", "images");
mkdirSync(out, { recursive: true });

const configHome = mkdtempSync(join(tmpdir(), "shiodoki-shots-"));
const dataDir = join(configHome, "shiodoki");
mkdirSync(dataDir, { recursive: true });

const now = new Date();
const minutesAgo = (m) => new Date(now.getTime() - m * 60_000).toISOString();
const daysAgo = (d) => new Date(now.getTime() - d * 86_400_000).toISOString();
const task = (id, name, priority, fields = {}) => ({
  id,
  name,
  priority,
  memo: "",
  completed: false,
  completedAt: null,
  deleted: false,
  totalMinutes: 0,
  sessionCount: 0,
  createdAt: daysAgo(10),
  updatedAt: daysAgo(1),
  updatedBy: "desktop",
  ...fields,
});
const tasks = [
  task("t1", "Write the README in English", "NOW", {
    totalMinutes: 85,
    sessionCount: 3,
    memo: "Add screenshots and the architecture section next",
    createdAt: daysAgo(2),
  }),
  task("t2", "Review pull request #84", "NOW", { totalMinutes: 30, sessionCount: 1, createdAt: daysAgo(1) }),
  task("t3", "Stand-up notes", "ROUTINE", { totalMinutes: 240, sessionCount: 16 }),
  task("t4", "Apply to the full-stack role", "SOONER", { totalMinutes: 120, sessionCount: 4, createdAt: daysAgo(5) }),
  task("t5", "Read the Firestore offline docs", "ANYTIME", { createdAt: daysAgo(7) }),
  task("t6", "Learn SwiftUI basics", "SOMEDAY", { createdAt: daysAgo(20) }),
  task("t7", "Stretch and walk", "BREAK", { totalMinutes: 45, sessionCount: 6 }),
  task("t8", "Set up the Android release key", "SOONER", {
    completed: true,
    completedAt: daysAgo(3),
    totalMinutes: 60,
    sessionCount: 2,
  }),
];
const session = (id, t, startMin, minutes) => ({
  id,
  taskId: t.id,
  taskName: t.name,
  startedAt: minutesAgo(startMin),
  endedAt: minutesAgo(startMin - minutes),
  elapsedMinutes: minutes,
  endReason: "interval",
  device: "desktop",
});
writeFileSync(
  join(dataDir, "store.json"),
  JSON.stringify({
    version: 1,
    tasks,
    // Today's sessions, shown on the block screen.
    sessions: [
      session("s1", tasks[2], 150, 15),
      session("s2", tasks[0], 130, 30),
      session("s3", tasks[1], 95, 30),
      session("s4", tasks[6], 60, 10),
      session("s5", tasks[0], 45, 25),
    ],
    preferences: { lastSelectedTaskId: "t1", nextTaskId: null },
  }),
);

const app = await electron.launch({
  executablePath: require("electron"),
  args: [
    join(root, "out/main/index.js"),
    "--ozone-platform=x11",
    ...(process.getuid?.() === 0 ? ["--no-sandbox"] : []),
  ],
  env: {
    ...process.env,
    TASK_MODE: "",
    TIMER_LOCAL: "1",
    SHIODOKI_LOCALE: "en",
    XDG_CONFIG_HOME: configHome,
    ELECTRON_RENDERER_URL: "",
  },
});
await app.evaluate(({ dialog }) => {
  dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false });
});

async function windowFor(route, timeoutMs = 10_000) {
  for (let waited = 0; waited < timeoutMs; waited += 100) {
    const page = app.windows().find((w) => !w.isClosed() && w.url().endsWith(`#${route}`));
    if (page) return page;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`window #${route} did not open`);
}

const hhmm = (d) => `${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}`;

try {
  // ---- picker ----
  const picker = await windowFor("picker");
  await picker.waitForSelector(".task-list [role=option]");
  await picker.waitForTimeout(500);
  await picker.screenshot({ path: join(out, "picker.png") });

  // ---- management with a task open in the editor ----
  await picker.click("text=Manage tasks");
  const management = await windowFor("management");
  await management.waitForSelector(".task-table tbody tr");
  await management.click('tr:has-text("Write the README in English")');
  await management.waitForTimeout(500);
  await management.screenshot({ path: join(out, "management.png") });

  // ---- start a session with a leave time 5 to 6 minutes from now; the warning comes 5 minutes before it ----
  await management.click('button[aria-label="Back to Quick Start"]');
  const picker2 = await windowFor("picker");
  await picker2.waitForSelector(".task-list [role=option]");
  const leave = new Date(Date.now() + 6 * 60_000);
  await picker2.fill('input[aria-label="Leave at"]', hhmm(leave));
  await picker2.selectOption('select[aria-label="Minutes before to stop"]', { index: 0 });
  await picker2.click('.task-list [role=option]:has-text("Write the README in English")');
  await picker2.click(".start-btn");
  const warning = await windowFor("leave-warning", 2 * 60_000);
  await warning.waitForTimeout(800);
  await warning.screenshot({ path: join(out, "leave-warning.png") });

  // ---- the block screen at the leave time ----
  const block = await windowFor("leave-block", 6 * 60_000);
  await block.waitForTimeout(800);
  // The block screen fills the display; keep only the panel in the middle.
  const panel = await block.evaluate(() => {
    const { innerWidth: w, innerHeight: h } = window;
    return { x: Math.round(w / 2 - 400), y: Math.round(h / 2 - 210), width: 800, height: 420 };
  });
  await block.screenshot({ path: join(out, "leave-block.png"), clip: panel });

  console.log("Screenshots saved to", out);
} finally {
  await app.close().catch(() => {});
  rmSync(configHome, { recursive: true, force: true });
}
