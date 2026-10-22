import { dialog, ipcMain, type IpcMainInvokeEvent } from "electron";
import { getLocale, t } from "@shared/i18n";
import { IPC, type StartSessionRequest } from "@shared/ipc";
import type { TaskDrop, TaskInput } from "@shared/task";
import type { AppController } from "./appController";
import type { TaskService } from "./taskService";
import type { WindowManager } from "./windowManager";

export interface AuthHooks {
  /** Google sign-in from the login window. */
  signIn(): Promise<void>;
}

export function registerIpcHandlers(
  controller: AppController,
  tasks: TaskService,
  windows: WindowManager,
  auth: AuthHooks,
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
  ipcMain.handle(IPC.syncGet, () => controller.syncInfo());

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
