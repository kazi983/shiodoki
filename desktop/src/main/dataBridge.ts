import { join } from "node:path";
import { BrowserWindow, ipcMain } from "electron";
import {
  DATA_IPC,
  type DataEvent,
  type DataRequest,
  type DataResponseMessage,
  type DataWindowConfig,
} from "@shared/sync";

/**
 * Hidden window that runs the Firebase SDK (src/renderer/data/dataMain.ts).
 * Firestore's offline persistence needs IndexedDB, which only exists in a
 * browser context, so the SDK cannot live in the main process.
 */
export class DataBridge {
  private win: BrowserWindow | null = null;
  private nextId = 1;
  private pending = new Map<number, { resolve(v: unknown): void; reject(e: Error): void }>();

  constructor(
    private readonly config: DataWindowConfig,
    private readonly onEvent: (event: DataEvent) => void,
  ) {}

  start(): void {
    ipcMain.handle(DATA_IPC.getConfig, (e) => {
      if (e.sender !== this.win?.webContents) throw new Error("not the data window");
      return this.config;
    });
    ipcMain.on(DATA_IPC.response, (e, message: DataResponseMessage) => {
      if (e.sender !== this.win?.webContents) return;
      const p = this.pending.get(message.id);
      if (!p) return;
      this.pending.delete(message.id);
      if (message.ok) p.resolve(message.result);
      else p.reject(new Error(message.error ?? "unknown error"));
    });
    ipcMain.on(DATA_IPC.event, (e, event: DataEvent) => {
      if (e.sender !== this.win?.webContents) return;
      this.onEvent(event);
    });

    this.win = new BrowserWindow({
      show: false,
      webPreferences: {
        preload: join(__dirname, "../preload/data.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: false,
      },
    });
    this.win.webContents.on("render-process-gone", (_e, details) => {
      console.error("Data window crashed:", details.reason);
      this.rejectAll(new Error("データ処理が停止しました"));
      if (this.win && !this.win.isDestroyed()) this.load();
    });
    this.win.webContents.on("console-message", (event) => {
      if (event.level === "error" || event.level === "warning") console.warn(`[data] ${event.message}`);
    });
    this.load();
  }

  /** True for the hidden window, so callers can skip it when broadcasting. */
  owns(win: BrowserWindow): boolean {
    return win === this.win;
  }

  request<T = unknown>(request: DataRequest, timeoutMs = 60_000): Promise<T> {
    const win = this.win;
    if (!win || win.isDestroyed()) return Promise.reject(new Error("データ処理が開始されていません"));
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`データ処理がタイムアウトしました (${request.op})`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v as T);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      win.webContents.send(DATA_IPC.request, { id, request });
    });
  }

  destroy(): void {
    this.rejectAll(new Error("終了しました"));
    if (this.win && !this.win.isDestroyed()) this.win.destroy();
    this.win = null;
  }

  private load(): void {
    const devUrl = process.env.ELECTRON_RENDERER_URL;
    if (devUrl) void this.win?.loadURL(`${devUrl}/data.html`);
    else void this.win?.loadFile(join(__dirname, "../renderer/data.html"));
  }

  private rejectAll(error: Error): void {
    for (const p of this.pending.values()) p.reject(error);
    this.pending.clear();
  }
}
