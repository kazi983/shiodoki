import { contextBridge, ipcRenderer } from "electron";
import { IPC, type DesktopApi } from "@shared/ipc";

function subscribe(channel: string, listener: () => void): () => void {
  const handler = () => listener();
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

const api: DesktopApi = {
  picker: {
    getState: () => ipcRenderer.invoke(IPC.pickerGetState),
    startSession: (req) => ipcRenderer.invoke(IPC.pickerStartSession, req),
    snooze: () => ipcRenderer.invoke(IPC.pickerSnooze),
    cancelLeaveSchedule: () => ipcRenderer.invoke(IPC.pickerCancelLeave),
    onRefresh: (listener) => subscribe(IPC.pickerRefresh, listener),
  },
  tasks: {
    listAll: () => ipcRenderer.invoke(IPC.tasksListAll),
    add: (input) => ipcRenderer.invoke(IPC.tasksAdd, input),
    update: (id, input) => ipcRenderer.invoke(IPC.tasksUpdate, id, input),
    complete: (id) => ipcRenderer.invoke(IPC.tasksComplete, id),
    reopen: (id) => ipcRenderer.invoke(IPC.tasksReopen, id),
    remove: (id) => ipcRenderer.invoke(IPC.tasksRemove, id),
    onChanged: (listener) => subscribe(IPC.tasksChanged, listener),
  },
  auth: {
    signIn: () => ipcRenderer.invoke(IPC.authSignIn),
  },
  sync: {
    get: () => ipcRenderer.invoke(IPC.syncGet),
  },
  nav: {
    openPicker: () => ipcRenderer.invoke(IPC.navOpenPicker),
    openManagement: () => ipcRenderer.invoke(IPC.navOpenManagement),
    exit: () => ipcRenderer.invoke(IPC.navExit),
  },
  overlay: {
    complete: () => ipcRenderer.invoke(IPC.overlayComplete),
    setExpanded: (expanded) => ipcRenderer.invoke(IPC.overlaySetExpanded, expanded),
  },
  leave: {
    dismissWarning: () => ipcRenderer.invoke(IPC.leaveDismissWarning),
  },
  dialog: {
    confirm: (title, message) => ipcRenderer.invoke(IPC.dialogConfirm, title, message),
    alert: (title, message) => ipcRenderer.invoke(IPC.dialogAlert, title, message),
  },
};

contextBridge.exposeInMainWorld("api", api);
