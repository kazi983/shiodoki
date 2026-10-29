import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { app, clipboard, dialog, ipcMain, shell, type IpcMainInvokeEvent } from "electron";
import { getLocale, t } from "@shared/i18n";
import { IPC, type GuidePage, type StartSessionRequest } from "@shared/ipc";
import type { SecretKind } from "@shared/passphrase";
import type { TaskDrop, TaskInput } from "@shared/task";
import type { AppController } from "./appController";
import type { TaskService } from "./taskService";
import type { WindowManager } from "./windowManager";

const GUIDE_URL = "https://github.com/kazi983/shiodoki/blob/main/docs/user-guide";

export interface AuthHooks {
  /** Google sign-in from the welcome window. */
  signIn(): Promise<void>;
  /** Welcome window: keep the data on this PC only. */
  useLocal(): Promise<void>;
}

/** Cloud mode only. Everything that needs the data key runs in the main process (EncryptionService). */
export interface EncryptionHooks {
  create(passphrase: string): Promise<string>;
  finishSetup(): Promise<void>;
  unlock(kind: SecretKind, secret: string): Promise<boolean>;
  changePassphrase(kind: SecretKind, secret: string, newPassphrase: string): Promise<boolean>;
  createRecoveryKey(): Promise<string>;
  signOut(): Promise<void>;
}

export function registerIpcHandlers(
  controller: AppController,
  tasks: TaskService,
  windows: WindowManager,
  auth: AuthHooks,
  encryption?: EncryptionHooks,
): void {
  const parentOf = (e: IpcMainInvokeEvent) => windows.fromWebContentsId(e.sender.id);

  ipcMain.on(IPC.appLocale, (e) => {
    e.returnValue = getLocale();
  });

  ipcMain.handle(IPC.pickerGetState, () => controller.getPickerState());
  ipcMain.handle(IPC.pickerStartSession, (_e, req: StartSessionRequest) => controller.startSession(req));
  ipcMain.handle(IPC.pickerSnooze, () => controller.snooze());
  ipcMain.handle(IPC.pickerCancelLeave, () => controller.cancelLeaveSchedule());

  ipcMain.handle(IPC.tasksListAll, () => tasks.listAll());
  ipcMain.handle(IPC.tasksAdd, (_e, input: TaskInput) => tasks.add(input));
  ipcMain.handle(IPC.tasksUpdate, (_e, id: string, patch: Partial<TaskInput>) => tasks.update(id, patch));
  ipcMain.handle(IPC.tasksMove, (_e, drop: TaskDrop, keepPosition: boolean) => tasks.move(drop, keepPosition));
  ipcMain.handle(IPC.tasksComplete, (_e, id: string) => tasks.complete(id));
  ipcMain.handle(IPC.tasksReopen, (_e, id: string) => tasks.reopen(id));
  ipcMain.handle(IPC.tasksRemove, (_e, id: string) => tasks.remove(id));

  ipcMain.handle(IPC.navOpenPicker, () => controller.backToPicker());
  ipcMain.handle(IPC.navOpenManagement, () => controller.openManagement());
  ipcMain.handle(IPC.navExit, () => controller.exit());

  ipcMain.handle(IPC.overlayGetState, () => controller.getRunningInfo());
  ipcMain.handle(IPC.overlayComplete, () => controller.completeFromOverlay());
  ipcMain.handle(IPC.overlaySetExpanded, (_e, expanded: boolean) => windows.setOverlayExpanded(expanded));
  ipcMain.handle(IPC.overlayDragStart, () => windows.startOverlayDrag());
  ipcMain.handle(IPC.overlayDragMove, () => windows.moveOverlayDrag());
  ipcMain.handle(IPC.overlayDragEnd, () => windows.endOverlayDrag());

  ipcMain.handle(IPC.leaveGetState, () => controller.getLeaveInfo());
  ipcMain.handle(IPC.leaveDismissWarning, () => controller.dismissWarning());

  ipcMain.handle(IPC.authSignIn, () => auth.signIn());
  ipcMain.handle(IPC.storageUseLocal, () => auth.useLocal());
  ipcMain.handle(IPC.shellOpenGuide, (_e, page: GuidePage) => {
    if (page !== "privacy") throw new Error(`Unknown guide page: ${String(page)}`);
    return shell.openExternal(`${GUIDE_URL}/${getLocale()}/${page}.md`);
  });
  ipcMain.handle(IPC.syncGet, () => controller.syncInfo());

  if (encryption) {
    ipcMain.handle(IPC.encryptionCreate, (_e, passphrase: string) => encryption.create(passphrase));
    ipcMain.handle(IPC.encryptionFinishSetup, () => encryption.finishSetup());
    ipcMain.handle(IPC.encryptionUnlock, (_e, kind: SecretKind, secret: string) => encryption.unlock(kind, secret));
    ipcMain.handle(IPC.encryptionChangePassphrase, (_e, kind: SecretKind, secret: string, passphrase: string) =>
      encryption.changePassphrase(kind, secret, passphrase),
    );
    ipcMain.handle(IPC.encryptionCreateRecoveryKey, () => encryption.createRecoveryKey());
    ipcMain.handle(IPC.encryptionSignOut, () => encryption.signOut());
  }
  ipcMain.handle(IPC.encryptionCopyRecoveryKey, (_e, recoveryKey: string) => clipboard.writeText(recoveryKey));
  ipcMain.handle(IPC.encryptionSaveRecoveryKey, async (e, recoveryKey: string) => {
    const options = {
      defaultPath: join(app.getPath("documents"), "shiodoki-recovery-key.txt"),
      filters: [{ name: "Text", extensions: ["txt"] }],
    };
    const parent = parentOf(e);
    const result = parent ? await dialog.showSaveDialog(parent, options) : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return;
    const account = controller.syncInfo().email ?? "";
    await writeFile(result.filePath, `Shiodoki ${t().encryption.recoveryKey}\n${account}\n\n${recoveryKey}\n`, {
      mode: 0o600,
    });
  });

  ipcMain.handle(IPC.dialogConfirm, async (e, title: string, message: string) => {
    const options = {
      type: "question" as const,
      buttons: [t().common.ok, t().common.cancel],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
      title,
      message,
    };
    const parent = parentOf(e);
    const result = parent ? await dialog.showMessageBox(parent, options) : await dialog.showMessageBox(options);
    return result.response === 0;
  });

  ipcMain.handle(IPC.dialogAlert, async (e, title: string, message: string) => {
    const options = { type: "warning" as const, buttons: [t().common.ok], title, message };
    const parent = parentOf(e);
    if (parent) await dialog.showMessageBox(parent, options);
    else await dialog.showMessageBox(options);
  });
}
