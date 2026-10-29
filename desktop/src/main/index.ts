import { hostname } from "node:os";
import { join } from "node:path";
import { app, dialog, shell } from "electron";
import { EMULATOR_PROJECT_ID, FIREBASE_CONFIG } from "@shared/firebaseConfig";
import { getLocale, setLocale, t } from "@shared/i18n";
import { IPC } from "@shared/ipc";
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
import {
  chooseLocale,
  loadLanguageSetting,
  loadOverlayOffset,
  saveLanguageSetting,
  saveOverlayOffset,
  type LanguageSetting,
} from "./settings";
import { JsonFileTaskRepository, type TaskRepository } from "./taskRepository";
import { TaskService } from "./taskService";
import { TimerService } from "./timerService";
import { watchScreenState } from "./screenStateMonitor";
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
// The npm scripts and the packaged .desktop entry pass --ozone-platform=x11.
// It must be on the command line: the main process picks its Ozone platform
// before this code runs, so app.commandLine.appendSwitch() would only switch
// the child processes, and the GPU process could not draw into the windows.
if (
  process.platform === "linux" &&
  process.env.WAYLAND_DISPLAY &&
  app.commandLine.getSwitchValue("ozone-platform") !== "x11"
) {
  console.warn(
    "Running on Wayland: always-on-top and window placement may not work. " +
      "Start with --ozone-platform=x11 to use XWayland.",
  );
}

// The UI is a few simple windows and does not need the GPU. On Linux the GPU
// process often crashes under XWayland (exit_code=139) before Chromium falls
// back to software rendering, which slows startup and floods the log.
// Set TIMER_ENABLE_GPU=1 to use the GPU anyway.
if (process.platform === "linux" && !process.env.TIMER_ENABLE_GPU) {
  app.disableHardwareAcceleration();
}

app.setName(APP_DIR_NAME);
app.setPath("userData", join(app.getPath("appData"), EMULATOR_MODE ? `${APP_DIR_NAME}-emulator` : APP_DIR_NAME));

let quitting = false;

function storeFile(): string {
  return join(app.getPath("userData"), STORE_FILE_NAME);
}

function settingsFile(): string {
  return join(app.getPath("userData"), "settings.json");
}

function main(): void {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }

  // Keep running in the tray when every window is closed.
  app.on("window-all-closed", () => {});

  app.whenReady().then(() => {
    // app.getLocale() is only valid after "ready". SHIODOKI_LOCALE overrides everything (tests).
    setLocale(chooseLocale(loadLanguageSetting(settingsFile()), app.getLocale(), process.env.SHIODOKI_LOCALE));
    if (LOCAL_MODE) startLocal();
    else startFirebase();
  });
}

// ---------------------------------------------------------------------------
// local mode
// ---------------------------------------------------------------------------

function startLocal(): void {
  const repo = new JsonFileTaskRepository(storeFile());
  const wired = wire(repo, () => ({ status: "local", email: null }));
  wired.controller.start();
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

  const wired = wire(repo, () => ({ status: repo.status, email }), {
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
      const { common, dialogs } = t();
      const ok = await showMessageBox(wired.windows, {
        type: "question",
        buttons: [common.logout, common.cancel],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
        title: common.logout,
        message: dialogs.logoutConfirm(email ?? ""),
      });
      if (ok.response !== 0) return;
      await wired.controller.restart(async () => {
        await bridge.request({ op: "signOut" }, 15_000).catch((e) => console.error(e));
      });
    },
  });
  broadcastChanged = () => wired.windows.broadcast(IPC.tasksChanged);

  bridge.start();
  let authKnown = false;
  void firstAuth.then((uid) => {
    authKnown = true;
    if (uid) wired.controller.start();
    else wired.windows.showLogin();
  });

  // No window is shown until the data window reports the sign-in state.
  // If it never does (crash, script error), say so instead of showing nothing.
  setTimeout(() => {
    if (authKnown || quitting) return;
    void dialog
      .showMessageBox({
        type: "warning",
        buttons: [t().dialogs.wait, t().common.quit],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
        title: "Shiodoki",
        message: t().dialogs.slowStart,
        detail: "Firebase has not started. Check the terminal for errors starting with [data].",
      })
      .then(({ response }) => {
        if (response === 1) void wired.controller.exit();
      });
  }, STARTUP_TIMEOUT_MS);
}

const STARTUP_TIMEOUT_MS = 15_000;

async function googleIdToken(): Promise<string> {
  const file = join(app.getAppPath(), "resources", "oauth-client.json");
  const client = loadOAuthClient(file);
  if (!client) {
    throw new Error(
      "The Google sign-in config file is missing.\n" +
        "Put resources/oauth-client.json in place as described in desktop/README.md (Google sign-in setup).",
    );
  }
  return signInWithGoogle(client, (url) => shell.openExternal(url));
}

/** First sign-in: copy tasks from this PC if the account has none yet (requirements D-07). */
async function offerMigration(bridge: DataBridge): Promise<void> {
  const local = await findLocalData(storeFile());
  if (!local) return;
  const remoteCount = await bridge.request<number>({ op: "countRemoteTasks" }, 30_000).catch(() => -1);
  if (remoteCount !== 0) return;

  const text = t().dialogs;
  const { response } = await dialog.showMessageBox({
    type: "question",
    buttons: [text.migrateCopy, text.migrateSkip],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
    title: text.migrateTitle,
    message: text.migrateConfirm(local.tasks.length),
    detail: text.migrateDetail(local.source),
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
      title: text.migrateTitle,
      message: text.migrateFailed(error instanceof Error ? error.message : String(error)),
    });
  }
}

/** A native dialog above the app's always-on-top windows: parented to a visible one if any. */
function showMessageBox(windows: WindowManager, options: Electron.MessageBoxOptions) {
  const parent = windows.dialogParent();
  return parent ? dialog.showMessageBox(parent, options) : dialog.showMessageBox(options);
}

/** Save the tray choice; the new language applies after a restart (now or later). */
async function changeLanguage(
  value: LanguageSetting,
  controller: AppController,
  windows: WindowManager,
): Promise<void> {
  saveLanguageSetting(settingsFile(), value);
  if (chooseLocale(value, app.getLocale(), process.env.SHIODOKI_LOCALE) === getLocale()) return;
  const text = t().language;
  const { response } = await showMessageBox(windows, {
    type: "question",
    buttons: [text.restartNow, text.later],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
    title: text.restartTitle,
    message: text.restartMessage,
  });
  if (response === 0) await controller.restart();
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
  windows = new WindowManager(
    {
      onPickerClosedByUser: () => controller.snooze(),
      onManagementClosedByUser: () => controller.backToPicker(),
      onWarningClosedByUser: () => controller.dismissWarning(),
      onLoginClosedByUser: () => void controller.exit(),
      onOverlayMoved: (offsetY) => saveOverlayOffset(settingsFile(), offsetY),
      isQuitting: () => quitting,
    },
    loadOverlayOffset(settingsFile()),
  );
  const wm = windows;
  let stopScreenWatch = (): void => {};

  controller = new AppController(
    tasks,
    sessions,
    timer,
    wm,
    {
      quit: () => {
        quitting = true;
        stopScreenWatch();
        firebase?.reporter.stop();
        wm.destroyAll();
        app.quit();
      },
      relaunch: () => {
        quitting = true;
        stopScreenWatch();
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

  stopScreenWatch = watchScreenState({
    onOff: () => void controller.onScreenOff(),
    onOn: () => controller.onScreenOn(),
  });

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
      language: {
        current: loadLanguageSetting(settingsFile()),
        change: (value) => void changeLanguage(value, controller, wm),
      },
    },
    TEST_MODE,
  );

  // A second launch: ask whether to bring this instance to front or restart it.
  app.on("second-instance", async () => {
    const { response } = await showMessageBox(wm, {
      type: "question",
      buttons: [t().dialogs.bringToFront, t().common.restart, t().common.cancel],
      defaultId: 0,
      cancelId: 2,
      noLink: true,
      title: "Shiodoki",
      message: t().dialogs.alreadyRunning,
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
