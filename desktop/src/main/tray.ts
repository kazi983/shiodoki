import { join } from "node:path";
import { app, Menu, nativeImage, Tray } from "electron";

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
    tray.setToolTip(testMode ? "30min Task Timer (TEST)" : "30min Task Timer");
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: "タスクを選ぶ", click: actions.openPicker },
        { label: "タスク管理", click: actions.openManagement },
        { type: "separator" },
        { label: "再起動", click: actions.restart },
        ...(actions.logout ? [{ label: "ログアウト", click: actions.logout }] : []),
        { label: "終了", click: actions.exit },
      ]),
    );
    return tray;
  } catch (error) {
    console.warn("Tray icon is not available:", error);
    return null;
  }
}
