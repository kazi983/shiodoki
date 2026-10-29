import { contextBridge, ipcRenderer } from "electron";
import { IPC, type DesktopApi } from "@shared/ipc";

function subscribe(channel: string, listener: () => void): () => void {
  const handler = () => listener();
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

const api: DesktopApi = {
  locale: ipcRenderer.sendSync(IPC.appLocale),
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
    update: (id, patch) => ipcRenderer.invoke(IPC.tasksUpdate, id, patch),
    move: (drop, keepPosition) => ipcRenderer.invoke(IPC.tasksMove, drop, keepPosition),
    complete: (id) => ipcRenderer.invoke(IPC.tasksComplete, id),
    reopen: (id) => ipcRenderer.invoke(IPC.tasksReopen, id),
    remove: (id) => ipcRenderer.invoke(IPC.tasksRemove, id),
    onChanged: (listener) => subscribe(IPC.tasksChanged, listener),
  },
  auth: {
    signIn: () => ipcRenderer.invoke(IPC.authSignIn),
  },
  storage: {
    useLocal: () => ipcRenderer.invoke(IPC.storageUseLocal),
  },
  shell: {
    openGuide: (page) => ipcRenderer.invoke(IPC.shellOpenGuide, page),
  },
  encryption: {
    create: (passphrase) => ipcRenderer.invoke(IPC.encryptionCreate, passphrase),
    finishSetup: () => ipcRenderer.invoke(IPC.encryptionFinishSetup),
    unlock: (kind, secret) => ipcRenderer.invoke(IPC.encryptionUnlock, kind, secret),
    changePassphrase: (kind, secret, newPassphrase) =>
      ipcRenderer.invoke(IPC.encryptionChangePassphrase, kind, secret, newPassphrase),
    createRecoveryKey: () => ipcRenderer.invoke(IPC.encryptionCreateRecoveryKey),
    copyRecoveryKey: (recoveryKey) => ipcRenderer.invoke(IPC.encryptionCopyRecoveryKey, recoveryKey),
    saveRecoveryKeyToFile: (recoveryKey) => ipcRenderer.invoke(IPC.encryptionSaveRecoveryKey, recoveryKey),
    signOut: () => ipcRenderer.invoke(IPC.encryptionSignOut),
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
    getState: () => ipcRenderer.invoke(IPC.overlayGetState),
    onRefresh: (listener) => subscribe(IPC.overlayRefresh, listener),
    complete: () => ipcRenderer.invoke(IPC.overlayComplete),
    setExpanded: (expanded) => ipcRenderer.invoke(IPC.overlaySetExpanded, expanded),
    dragStart: () => ipcRenderer.invoke(IPC.overlayDragStart),
    dragMove: () => ipcRenderer.invoke(IPC.overlayDragMove),
    dragEnd: () => ipcRenderer.invoke(IPC.overlayDragEnd),
  },
  leave: {
    getState: () => ipcRenderer.invoke(IPC.leaveGetState),
    dismissWarning: () => ipcRenderer.invoke(IPC.leaveDismissWarning),
  },
  dialog: {
    confirm: (title, message) => ipcRenderer.invoke(IPC.dialogConfirm, title, message),
    alert: (title, message) => ipcRenderer.invoke(IPC.dialogAlert, title, message),
  },
};

contextBridge.exposeInMainWorld("api", api);
