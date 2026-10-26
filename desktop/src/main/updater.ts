import { t } from "@shared/i18n";

/** The part of electron-updater's `autoUpdater` used here (a fake in tests). */
export interface UpdaterPort {
  autoDownload: boolean;
  on(event: "update-available" | "update-downloaded", listener: (info: { version: string }) => void): unknown;
  on(event: "error", listener: (error: Error) => void): unknown;
  checkForUpdates(): Promise<unknown>;
  downloadUpdate(): Promise<unknown>;
}

export interface UpdatePromptDeps {
  updater: UpdaterPort;
  currentVersion: string;
  /** A native message box; resolves to the index of the clicked button. */
  ask(options: { message: string; detail: string; buttons: string[] }): Promise<number>;
  showError(message: string): void;
  /** Opens the release notes in the browser. */
  openReleasePage(version: string): void;
  /** Quits through AppController (records the session) and runs the downloaded installer. */
  restartToInstall(): void;
}

export const RELEASES_URL = "https://github.com/kazi983/shiodoki/releases";

/**
 * Checks GitHub Releases once and asks before downloading and before restarting.
 * Drafts are invisible to electron-updater, so an update reaches users only when a release is published.
 * A failed check (offline, no release yet) is only logged.
 */
export function startUpdateCheck(deps: UpdatePromptDeps): void {
  const { updater } = deps;
  // Nothing is downloaded until the user agrees. autoInstallOnAppQuit stays on (the default): electron-updater
  // registers its quit handler when the download finishes, which "Update when I quit" relies on.
  updater.autoDownload = false;
  let downloading = false;

  updater.on("error", (error) => {
    console.error("[updater]", error);
    if (downloading) {
      downloading = false;
      deps.showError(t().update.failed(error.message));
    }
  });

  updater.on("update-available", (info) => void askToDownload(deps, info.version, () => (downloading = true)));

  updater.on("update-downloaded", (info) => {
    downloading = false;
    void askToRestart(deps, info.version);
  });

  updater.checkForUpdates().catch(() => {}); // already reported through "error"
}

async function askToDownload(deps: UpdatePromptDeps, version: string, onDownload: () => void): Promise<void> {
  const text = t().update;
  for (;;) {
    const response = await deps.ask({
      message: text.available(version, deps.currentVersion),
      detail: text.availableDetail,
      buttons: [text.update, text.whatsNew, text.later],
    });
    if (response === 1) {
      // Keep the question open so the user can decide after reading.
      deps.openReleasePage(version);
      continue;
    }
    if (response === 0) {
      onDownload();
      deps.updater.downloadUpdate().catch(() => {}); // reported through "error"
    }
    return;
  }
}

async function askToRestart(deps: UpdatePromptDeps, version: string): Promise<void> {
  const text = t().update;
  const response = await deps.ask({
    message: text.downloaded(version),
    detail: text.downloadedDetail,
    buttons: [text.restartNow, text.onQuit],
  });
  if (response === 0) deps.restartToInstall();
}
