import { existsSync, readFileSync } from "node:fs";
import { hostname, homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { app, dialog, shell } from "electron";
import { EMULATOR_PROJECT_ID, FIREBASE_CONFIG } from "@shared/firebaseConfig";
import { IPC } from "@shared/ipc";
import { convertLegacyTasks, legacyDataFile } from "@shared/legacy";
import type { DataEvent, SyncInfo } from "@shared/sync";
import { AppController } from "./appController";
import { APP_DIR_NAME, INTERVAL_MS, SNOOZE_MS, STORE_FILE_NAME, TEST_MODE } from "./config";
import { DataBridge } from "./dataBridge";
import { DesktopStateReporter } from "./desktopStateReporter";
import { FirestoreTaskRepository } from "./firestoreTaskRepository";
import { loadOAuthClient, signInWithGoogle } from "./googleOAuth";
import { registerIpcHandlers } from "./ipc";
import { findLocalData } from "./localMigration";
import { SessionService } from "./sessionService";
import { JsonFileTaskRepository, type TaskRepository } from "./taskRepository";
import { TaskService } from "./taskService";
import { TimerService } from "./timerService";
import { createTray } from "./tray";
import { WindowManager } from "./windowManager";

/**
 * Modes:
 *   default                       Firebase (Google sign-in, Firestore sync)
 *   TIMER_LOCAL=1                 local JSON file only, no sign-in
 *   TIMER_FIREBASE_EMULATOR=1     Firebase emulators with a fake Google account (tests)
 */
const LOCAL_MODE = process.env.TIMER_LOCAL === "1";
const EMULATOR_MODE = process.env.TIMER_FIREBASE_EMULATOR === "1";
const DEVICE = hostname();

// On Ubuntu (Wayland), apps cannot keep windows always-on-top or place them
// at a fixed position. Run through XWayland like v1 (Tk) did.
// Set TIMER_ALLOW_WAYLAND=1 to opt out.
if (process.platform === "linux" && !process.env.TIMER_ALLOW_WAYLAND) {
  app.commandLine.appendSwitch("ozone-platform", "x11");
}

app.setName(APP_DIR_NAME);
app.setPath(
  "userData",
  join(app.getPath("appData"), EMULATOR_MODE ? `${APP_DIR_NAME}-emulator` : APP_DIR_NAME),
);

let quitting = false;

function storeFile(): string {
  return join(app.getPath("userData"), STORE_FILE_NAME);
}

function legacyFile(): string {
  return legacyDataFile(process.platform, process.env, homedir(), TEST_MODE);
}

function main(): void {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }

  // Keep running in the tray when every window is closed.
  app.on("window-all-closed", () => {});

  app.whenReady().then(() => (LOCAL_MODE ? startLocal() : startFirebase()));
}

// ---------------------------------------------------------------------------
// local mode
// ---------------------------------------------------------------------------

function startLocal(): void {
  const repo = new JsonFileTaskRepository(storeFile());
  importLegacyIfNeeded(repo);
  const wired = wire(repo, () => ({ status: "local", email: null }));
  wired.controller.start();
}

function importLegacyIfNeeded(repo: JsonFileTaskRepository): void {
  if (repo.exists) return;
  const file = legacyFile();
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

// ---------------------------------------------------------------------------
// Firebase mode
// ---------------------------------------------------------------------------

function startFirebase(): void {
  let email: string | null = null;
  let resolveFirstAuth!: (uid: string | null) => void;
  const firstAuth = new Promise<string | null>((resolve) => (resolveFirstAuth = resolve));

  let broadcastChanged = () => {};
  // Events only arrive after bridge.start(), when everything below exists.
  let repo!: FirestoreTaskRepository;

  const bridge = new DataBridge(
    {
      firebase: EMULATOR_MODE
        ? { apiKey: "demo-key", projectId: EMULATOR_PROJECT_ID, authDomain: "localhost" }
        : { ...FIREBASE_CONFIG },
      emulator: EMULATOR_MODE,
      device: DEVICE,
    },
    (event: DataEvent) => {
      if (event.type === "auth") {
        email = event.email;
        resolveFirstAuth(event.uid);
      } else if (event.type === "error") {
        console.error(`[data] ${event.message}`);
      } else {
        repo.handleEvent(event);
      }
    },
  );

  repo = new FirestoreTaskRepository(bridge, () => broadcastChanged());

  const wired = wire(
    repo,
    () => ({ status: repo.status, email }),
    {
      reporter: new DesktopStateReporter((state) => repo.setDesktopState(state), DEVICE),
      beforeQuit: async () => {
        // Best effort: if offline, the writes stay queued in IndexedDB and are sent next time.
        await repo.flush(2_000).catch(() => false);
      },
      signIn: async () => {
        const idToken = EMULATOR_MODE
          ? JSON.stringify({ sub: "e2e-user", email: "e2e@example.com", email_verified: true })
          : await googleIdToken();
        await bridge.request({ op: "signIn", idToken }, 30_000);
        await offerMigration(bridge);
        wired.windows.closeLogin();
        wired.controller.start();
      },
      logout: async () => {
        const ok = await dialog.showMessageBox({
          type: "question",
          buttons: ["ログアウト", "キャンセル"],
          defaultId: 0,
          cancelId: 1,
          noLink: true,
          title: "ログアウト",
          message: `${email ?? ""} からログアウトしますか？\nこの PC に保存されたデータも削除されます。`,
        });
        if (ok.response !== 0) return;
        await wired.controller.restart(async () => {
          await bridge.request({ op: "signOut" }, 15_000).catch((e) => console.error(e));
        });
      },
    },
  );
  broadcastChanged = () => wired.windows.broadcast(IPC.tasksChanged);

  bridge.start();
  void firstAuth.then((uid) => {
    if (uid) wired.controller.start();
    else wired.windows.showLogin();
  });
}

async function googleIdToken(): Promise<string> {
  const file = join(app.getAppPath(), "resources", "oauth-client.json");
  const client = loadOAuthClient(file);
  if (!client) {
    throw new Error(
      "Google ログインの設定ファイルがありません。\n" +
        "v2/desktop/README.md の「Google ログインの設定」に従って resources/oauth-client.json を置いてください。",
    );
  }
  return signInWithGoogle(client, (url) => shell.openExternal(url));
}

/** First sign-in: copy tasks from this PC if the account has none yet (requirements D-07). */
async function offerMigration(bridge: DataBridge): Promise<void> {
  const local = await findLocalData(storeFile(), legacyFile(), randomUUID);
  if (!local) return;
  const remoteCount = await bridge.request<number>({ op: "countRemoteTasks" }, 30_000).catch(() => -1);
  if (remoteCount !== 0) return;

  const { response } = await dialog.showMessageBox({
    type: "question",
    buttons: ["コピーする", "コピーしない"],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
    title: "タスクの移行",
    message: `この PC のタスク ${local.tasks.length} 件を Firebase にコピーしますか？`,
    detail: `読み込み元: ${local.source}\n累計時間もそのまま引き継ぎます。`,
  });
  if (response !== 0) return;
  try {
    await bridge.request(
      { op: "importTasks", tasks: local.tasks, preferences: { lastSelectedTaskId: local.lastSelectedTaskId } },
      120_000,
    );
    local.markMigrated();
  } catch (error) {
    await dialog.showMessageBox({
      type: "error",
      title: "タスクの移行",
      message: `タスクをコピーできませんでした: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

// ---------------------------------------------------------------------------
// shared wiring
// ---------------------------------------------------------------------------

interface FirebaseHooks {
  reporter: DesktopStateReporter;
  beforeQuit(): Promise<void>;
  signIn(): Promise<void>;
  logout(): Promise<void>;
}

function wire(repo: TaskRepository, syncInfo: () => SyncInfo, firebase?: FirebaseHooks) {
  let windows: WindowManager | null = null;
  const tasks = new TaskService(repo, () => windows?.broadcast(IPC.tasksChanged));
  const timer = new TimerService();
  const sessions = new SessionService(DEVICE);

  let controller!: AppController;
  windows = new WindowManager({
    onPickerClosedByUser: () => controller.snooze(),
    onManagementClosedByUser: () => controller.backToPicker(),
    onWarningClosedByUser: () => controller.dismissWarning(),
    onLoginClosedByUser: () => void controller.exit(),
    isQuitting: () => quitting,
  });
  const wm = windows;

  controller = new AppController(
    tasks,
    sessions,
    timer,
    wm,
    {
      quit: () => {
        quitting = true;
        firebase?.reporter.stop();
        wm.destroyAll();
        app.quit();
      },
      relaunch: () => {
        quitting = true;
        app.relaunch();
        app.exit(0);
      },
    },
    {
      intervalMs: INTERVAL_MS,
      snoozeMs: SNOOZE_MS,
      testMode: TEST_MODE,
      syncInfo,
      onStatusChange: firebase ? (s) => firebase.reporter.report(s) : undefined,
      beforeQuit: firebase?.beforeQuit,
    },
  );

  registerIpcHandlers(controller, tasks, wm, {
    signIn: firebase?.signIn ?? (async () => {}),
  });

  createTray(
    {
      openPicker: () => void controller.openPicker(),
      openManagement: () => controller.openManagement(),
      restart: () => void controller.restart(),
      exit: () => void controller.exit(),
      logout: firebase ? () => void firebase.logout() : undefined,
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

  return { controller, windows: wm };
}

main();
