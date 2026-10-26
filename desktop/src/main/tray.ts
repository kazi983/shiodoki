import { join } from "node:path";
import { app, Menu, nativeImage, Tray } from "electron";
import { LANGUAGE_NAMES, t } from "@shared/i18n";
import { LANGUAGE_SETTINGS, type LanguageSetting } from "./settings";

export interface TrayActions {
  openPicker(): void;
  openManagement(): void;
  restart(): void;
  exit(): void;
  /** Omitted in local mode. */
  logout?: () => void;
  /** Local mode only (not with TIMER_LOCAL=1). */
  signInToSync?: () => void;
  /** Cloud mode only: change the passphrase, create a new recovery key. */
  openEncryption?: () => void;
  language: { current: LanguageSetting; change(value: LanguageSetting): void };
}

/**
 * System tray icon. On GNOME this needs the "AppIndicator and
 * KStatusNotifierItem Support" extension; without it the app still runs.
 */
export function createTray(actions: TrayActions, testMode: boolean): Tray | null {
  try {
    const icon = nativeImage.createFromPath(join(app.getAppPath(), "resources", "tray.png"));
    const tray = new Tray(icon);
    tray.setToolTip(testMode ? "Shiodoki (TEST)" : "Shiodoki");
    const { common, tray: text } = t();
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: text.pickTask, click: actions.openPicker },
        { label: common.manageTasks, click: actions.openManagement },
        {
          label: text.language,
          submenu: LANGUAGE_SETTINGS.map((value) => ({
            label: value === "system" ? t().language.system : LANGUAGE_NAMES[value],
            type: "radio" as const,
            checked: value === actions.language.current,
            click: () => actions.language.change(value),
          })),
        },
        { type: "separator" },
        ...(actions.signInToSync ? [{ label: text.signInToSync, click: actions.signInToSync }] : []),
        ...(actions.openEncryption ? [{ label: text.encryption, click: actions.openEncryption }] : []),
        { label: common.restart, click: actions.restart },
        ...(actions.logout ? [{ label: common.logout, click: actions.logout }] : []),
        { label: common.quit, click: actions.exit },
      ]),
    );
    return tray;
  } catch (error) {
    console.warn("Tray icon is not available:", error);
    return null;
  }
}
