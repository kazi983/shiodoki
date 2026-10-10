import { join } from "node:path";
import { app, Menu, nativeImage, Tray } from "electron";
import { t } from "@shared/i18n";

export interface TrayActions {
  openPicker(): void;
  openManagement(): void;
  restart(): void;
  exit(): void;
  /** Omitted in local mode. */
  logout?: () => void;
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
        { type: "separator" },
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
