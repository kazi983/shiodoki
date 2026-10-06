import { existsSync, readFileSync } from "node:fs";
import { hostname, homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { app, dialog } from "electron";
import { IPC } from "@shared/ipc";
import { convertLegacyTasks, legacyDataFile } from "@shared/legacy";
import { AppController } from "./appController";
import { APP_DIR_NAME, INTERVAL_MS, SNOOZE_MS, STORE_FILE_NAME, TEST_MODE } from "./config";
import { registerIpcHandlers } from "./ipc";
import { SessionService } from "./sessionService";
import { JsonFileTaskRepository } from "./taskRepository";
import { TaskService } from "./taskService";
import { TimerService } from "./timerService";
import { createTray } from "./tray";
import { WindowManager } from "./windowManager";

// On Ubuntu (Wayland), apps cannot keep windows always-on-top or place them
// at a fixed position. Run through XWayland like v1 (Tk) did.
// Set TIMER_ALLOW_WAYLAND=1 to opt out.
if (process.platform === "linux" && !process.env.TIMER_ALLOW_WAYLAND) {
  app.commandLine.appendSwitch("ozone-platform", "x11");
}

app.setName(APP_DIR_NAME);
app.setPath("userData", join(app.getPath("appData"), APP_DIR_NAME));

let quitting = false;

function main(): void {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }

  app.whenReady().then(async () => {
    const repo = new JsonFileTaskRepository(join(app.getPath("userData"), STORE_FILE_NAME));
    importLegacyIfNeeded(repo);

    let windows: WindowManager | null = null;
    const tasks = new TaskService(repo, () => windows?.broadcast(IPC.tasksChanged));
    const timer = new TimerService();
    const sessions = new SessionService(hostname());

    let controller: AppController;
    windows = new WindowManager({
      onPickerClosedByUser: () => controller.snooze(),
      onManagementClosedByUser: () => controller.backToPicker(),
      onWarningClosedByUser: () => controller.dismissWarning(),
      isQuitting: () => quitting,
    });

    controller = new AppController(
      tasks,
      sessions,
      timer,
      windows,
      {
        quit: () => {
          quitting = true;
          windows?.destroyAll();
          app.quit();
        },
        relaunch: () => {
          quitting = true;
          app.relaunch();
          app.exit(0);
        },
      },
      { intervalMs: INTERVAL_MS, snoozeMs: SNOOZE_MS, testMode: TEST_MODE },
    );

    registerIpcHandlers(controller, tasks, windows);

    createTray(
      {
        openPicker: () => void controller.openPicker(),
        openManagement: () => controller.openManagement(),
        restart: () => void controller.restart(),
        exit: () => void controller.exit(),
      },
      TEST_MODE,
    );

    // A second launch: ask whether to bring this instance to front or restart it.
    app.on("second-instance", async () => {
      const { response } = await dialog.showMessageBox({
        type: "question",
        buttons: ["前面に表示", "再起動", "キャンセル"],
        defaultId: 0,
        cancelId: 2,
        noLink: true,
        title: "30min Task Timer",
        message: "30min Task Timer はすでに起動しています。",
      });
      if (response === 0) void controller.openPicker();
      if (response === 1) void controller.restart();
    });

    // Ctrl+C in the terminal or OS logout: record the running session first.
    app.on("before-quit", (event) => {
      if (controller.isShuttingDown) return;
      event.preventDefault();
      void controller.exit();
    });

    controller.start();
  });

  // Keep running in the tray when every window is closed.
  app.on("window-all-closed", () => {});
}

function importLegacyIfNeeded(repo: JsonFileTaskRepository): void {
  if (repo.exists) return;
  const file = legacyDataFile(process.platform, process.env, homedir(), TEST_MODE);
  if (!existsSync(file)) return;
  try {
    const raw = JSON.parse(readFileSync(file, "utf8"));
    const { tasks, lastSelectedTaskId } = convertLegacyTasks(raw, new Date(), randomUUID);
    repo.importLegacy(tasks, lastSelectedTaskId, new Date());
    console.info(`Imported ${tasks.length} tasks from ${file}`);
  } catch (error) {
    console.error(`Failed to import ${file}:`, error);
  }
}

main();
