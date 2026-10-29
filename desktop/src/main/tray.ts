import { join } from "node:path";
import { app, Menu, nativeImage, Tray } from "electron";
import { LANGUAGE_NAMES, t } from "@shared/i18n";
import { BUFFER_OPTIONS, LEAVE_TIME_PRESETS, type LeaveDefaults } from "@shared/leave";
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
  language: { current(): LanguageSetting; change(value: LanguageSetting): void };
  /** Initial leave inputs of the next picker; a running leave schedule is not changed. */
  leaveDefaults: { current(): LeaveDefaults; change(patch: Partial<LeaveDefaults>): void };
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
    // AppIndicator (Linux) does not redraw radio items after a click, so the menu is rebuilt after each choice.
    const refresh = () => tray.setContextMenu(buildMenu());
    const buildMenu = (): Menu => {
      const leave = actions.leaveDefaults.current();
      const language = actions.language.current();
      return Menu.buildFromTemplate([
        { label: text.pickTask, click: actions.openPicker },
        { label: common.manageTasks, click: actions.openManagement },
        {
          label: text.leaveDefaults,
          submenu: [
            {
              label: t().picker.leaveAt,
              submenu: [null, ...LEAVE_TIME_PRESETS].map((value) => ({
                label: value ?? text.noLeaveTime,
                type: "radio" as const,
                checked: value === leave.leaveTime,
                click: () => {
                  actions.leaveDefaults.change({ leaveTime: value });
                  refresh();
                },
              })),
            },
            {
              label: text.bufferMenu,
              submenu: BUFFER_OPTIONS.map((minutes) => ({
                label: text.bufferOption(minutes),
                type: "radio" as const,
                checked: minutes === leave.bufferMinutes,
                click: () => {
                  actions.leaveDefaults.change({ bufferMinutes: minutes });
                  refresh();
                },
              })),
            },
          ],
        },
        {
          label: text.language,
          submenu: LANGUAGE_SETTINGS.map((value) => ({
            label: value === "system" ? t().language.system : LANGUAGE_NAMES[value],
            type: "radio" as const,
            checked: value === language,
            click: () => {
              actions.language.change(value);
              refresh();
            },
          })),
        },
        { type: "separator" },
        ...(actions.signInToSync ? [{ label: text.signInToSync, click: actions.signInToSync }] : []),
        ...(actions.openEncryption ? [{ label: text.encryption, click: actions.openEncryption }] : []),
        { label: common.restart, click: actions.restart },
        ...(actions.logout ? [{ label: common.logout, click: actions.logout }] : []),
        { label: common.quit, click: actions.exit },
      ]);
    };
    refresh();
    return tray;
  } catch (error) {
    console.warn("Tray icon is not available:", error);
    return null;
  }
}
