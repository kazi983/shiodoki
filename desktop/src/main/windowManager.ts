import { join } from "node:path";
import { BrowserWindow, screen, type Display, type Rectangle } from "electron";
import type { WindowPort } from "./appController";
import { centeredBounds } from "./geometry";
import { t } from "@shared/i18n";
import { IPC } from "@shared/ipc";

export type Route = "picker" | "management" | "overlay" | "leave-warning" | "leave-block" | "login";

/** Collapsed: timer ring tab. Expanded (hover): task name, remaining time and the complete button. */
const OVERLAY_SIZE = {
  collapsed: { width: 56, height: 56 },
  expanded: { width: 280, height: 128 },
};

export interface WindowHandlers {
  /** Picker closed by the user (title bar X) -> snooze. */
  onPickerClosedByUser(): void;
  /** Management closed by the user -> back to picker. */
  onManagementClosedByUser(): void;
  /** Warning closed by the user. */
  onWarningClosedByUser(): void;
  /** Sign-in window closed before signing in -> quit. */
  onLoginClosedByUser(): void;
  isQuitting(): boolean;
}

/**
 * Creates and positions the app windows.
 *
 * Every window opens on the same display as the previously shown window;
 * the very first one opens on the display under the mouse pointer
 * (same behavior as v1's center_window()).
 */
export class WindowManager implements WindowPort {
  private picker: BrowserWindow | null = null;
  private management: BrowserWindow | null = null;
  private overlay: BrowserWindow | null = null;
  private leave: BrowserWindow | null = null;
  private login: BrowserWindow | null = null;
  private lastDisplayId: number | null = null;
  /** Set while closing a window from code, so "closed by user" handlers do not fire. */
  private closingProgrammatically = new WeakSet<BrowserWindow>();

  constructor(private readonly handlers: WindowHandlers) {}

  // -------------------------
  // WindowPort
  // -------------------------

  showPicker(): void {
    if (this.picker && !this.picker.isDestroyed()) {
      this.focus(this.picker);
      this.picker.webContents.send(IPC.pickerRefresh);
      return;
    }
    this.picker = this.create("picker", {
      title: "Quick Start",
      width: 520,
      height: 720,
      minWidth: 420,
      minHeight: 560,
      alwaysOnTop: true,
    });
    this.picker.on("close", () => {
      if (!this.isProgrammatic(this.picker)) this.handlers.onPickerClosedByUser();
    });
    this.picker.on("closed", () => (this.picker = null));
  }

  closePicker(): void {
    this.closeQuietly(this.picker);
  }

  showManagement(): void {
    if (this.management && !this.management.isDestroyed()) {
      this.focus(this.management);
      return;
    }
    this.management = this.create("management", {
      title: t().common.manageTasks,
      width: 1100,
      height: 760,
      minWidth: 760,
      minHeight: 520,
      alwaysOnTop: true,
    });
    this.management.on("close", () => {
      if (!this.isProgrammatic(this.management)) this.handlers.onManagementClosedByUser();
    });
    this.management.on("closed", () => (this.management = null));
  }

  closeManagement(): void {
    this.closeQuietly(this.management);
  }

  showOverlay(): void {
    if (!this.overlay || this.overlay.isDestroyed()) {
      this.overlay = new BrowserWindow({
        ...OVERLAY_SIZE.collapsed,
        frame: false,
        resizable: false,
        movable: false,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        skipTaskbar: true,
        focusable: false,
        alwaysOnTop: true,
        show: false,
        // Transparent so the tab's rounded left corners show the desktop behind them.
        transparent: true,
        backgroundColor: "#00000000",
        webPreferences: this.webPreferences(),
      });
      this.overlay.setAlwaysOnTop(true, "screen-saver");
      this.overlay.setVisibleOnAllWorkspaces(true);
      this.load(this.overlay, "overlay");
      this.overlay.on("closed", () => (this.overlay = null));
    }
    this.setOverlayExpanded(false);
    this.overlay.webContents.send(IPC.overlayRefresh);
    this.overlay.showInactive();
  }

  hideOverlay(): void {
    if (this.overlay && !this.overlay.isDestroyed()) this.overlay.hide();
  }

  /** Grow to the left and down on hover; the top-right corner stays on the right edge. */
  setOverlayExpanded(expanded: boolean): void {
    if (!this.overlay || this.overlay.isDestroyed()) return;
    const { workArea } = this.targetDisplay();
    const size = expanded ? OVERLAY_SIZE.expanded : OVERLAY_SIZE.collapsed;
    this.overlay.setBounds({
      x: workArea.x + workArea.width - size.width,
      y: workArea.y + Math.round(workArea.height * 0.2),
      ...size,
    });
  }

  showLogin(): void {
    if (this.login && !this.login.isDestroyed()) {
      this.focus(this.login);
      return;
    }
    this.login = this.create("login", {
      title: t().login.windowTitle,
      width: 520,
      height: 560,
      minWidth: 420,
      minHeight: 480,
    });
    this.login.on("close", () => {
      if (!this.isProgrammatic(this.login)) this.handlers.onLoginClosedByUser();
    });
    this.login.on("closed", () => (this.login = null));
  }

  closeLogin(): void {
    this.closeQuietly(this.login);
  }

  showLeave(mode: "warning" | "block"): void {
    this.closeQuietly(this.leave);
    const display = this.targetDisplay();
    const block = mode === "block";
    const win = this.create(block ? "leave-block" : "leave-warning", {
      title: "Shiodoki",
      width: 720,
      height: 420,
      frame: false,
      resizable: false,
      minimizable: !block,
      closable: !block,
      alwaysOnTop: true,
      skipTaskbar: false,
      bounds: block ? display.workArea : undefined,
    });
    win.setAlwaysOnTop(true, block ? "screen-saver" : "floating");
    win.on("close", (event) => {
      // The block screen cannot be closed; quit from the tray instead.
      if (block && !this.handlers.isQuitting()) {
        event.preventDefault();
        return;
      }
      if (!block && !this.isProgrammatic(win)) this.handlers.onWarningClosedByUser();
    });
    win.on("closed", () => {
      if (this.leave === win) this.leave = null;
    });
    this.leave = win;
  }

  closeLeave(): void {
    if (!this.leave || this.leave.isDestroyed()) return;
    // The block window refuses to close unless quitting; destroy() bypasses that.
    const win = this.leave;
    this.leave = null;
    this.closingProgrammatically.add(win);
    win.destroy();
  }

  // -------------------------
  // helpers
  // -------------------------

  /** Window that should parent native dialogs for a given sender. */
  fromWebContentsId(id: number): BrowserWindow | null {
    return BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && w.webContents.id === id) ?? null;
  }

  broadcast(channel: string): void {
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed()) w.webContents.send(channel);
    }
  }

  destroyAll(): void {
    for (const w of BrowserWindow.getAllWindows()) {
      this.closingProgrammatically.add(w);
      w.destroy();
    }
  }

  private create(
    route: Route,
    opts: {
      title: string;
      width: number;
      height: number;
      minWidth?: number;
      minHeight?: number;
      alwaysOnTop?: boolean;
      frame?: boolean;
      resizable?: boolean;
      minimizable?: boolean;
      closable?: boolean;
      skipTaskbar?: boolean;
      bounds?: Rectangle;
    },
  ): BrowserWindow {
    const display = this.targetDisplay();
    const bounds = opts.bounds ?? centeredBounds(display, opts.width, opts.height);
    const win = new BrowserWindow({
      ...bounds,
      title: opts.title,
      minWidth: opts.minWidth,
      minHeight: opts.minHeight,
      frame: opts.frame ?? true,
      resizable: opts.resizable ?? true,
      minimizable: opts.minimizable ?? true,
      closable: opts.closable ?? true,
      alwaysOnTop: opts.alwaysOnTop ?? false,
      skipTaskbar: opts.skipTaskbar ?? false,
      autoHideMenuBar: true,
      show: false,
      backgroundColor: route === "leave-block" ? "#070d1c" : "#0b1326",
      webPreferences: this.webPreferences(),
    });
    win.setMenu(null);
    win.once("ready-to-show", () => this.focus(win));
    win.on("moved", () => this.remember(win));
    this.load(win, route);
    this.lastDisplayId = display.id;
    return win;
  }

  private webPreferences(): Electron.WebPreferences {
    return {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    };
  }

  private load(win: BrowserWindow, route: Route): void {
    const devUrl = process.env.ELECTRON_RENDERER_URL;
    if (devUrl) void win.loadURL(`${devUrl}#${route}`);
    else void win.loadFile(join(__dirname, "../renderer/index.html"), { hash: route });
  }

  private focus(win: BrowserWindow): void {
    if (win.isDestroyed()) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.moveTop();
    win.focus();
  }

  private remember(win: BrowserWindow): void {
    if (!win.isDestroyed()) this.lastDisplayId = screen.getDisplayMatching(win.getBounds()).id;
  }

  private targetDisplay(): Display {
    const displays = screen.getAllDisplays();
    const last = displays.find((d) => d.id === this.lastDisplayId);
    return last ?? screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  }

  private closeQuietly(win: BrowserWindow | null): void {
    if (!win || win.isDestroyed()) return;
    this.remember(win);
    this.closingProgrammatically.add(win);
    win.close();
  }

  private isProgrammatic(win: BrowserWindow | null): boolean {
    if (!win) return true;
    if (this.handlers.isQuitting()) return true;
    if (this.closingProgrammatically.has(win)) {
      this.closingProgrammatically.delete(win);
      return true;
    }
    return false;
  }
}
