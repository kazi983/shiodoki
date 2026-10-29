/**
 * Contract between the renderer (window.api) and the main process.
 */

import type { Locale } from "./i18n";
import type { LeaveDefaults, LeaveScheduleInput, LeaveScheduleStatus } from "./leave";
import type { SecretKind } from "./passphrase";
import type { DaySummary } from "./session";
import type { SyncInfo } from "./sync";
import type { Task, TaskDrop, TaskInput } from "./task";

export type GuidePage = "privacy";

export interface PickerState {
  tasks: Task[];
  lastSelectedTaskId: string | null;
  leave: LeaveScheduleStatus | null;
  /** Initial leave inputs while no schedule is set. */
  leaveInput: LeaveDefaults;
  testMode: boolean;
  /** Length of one session (30 minutes; 5 seconds in TASK_MODE=test). */
  intervalMs: number;
  /** Delay of "remind me later" (5 minutes; 10 seconds in TASK_MODE=test). */
  snoozeMs: number;
  sync: SyncInfo;
}

/** The running session, for the overlay. */
export interface RunningInfo {
  taskName: string;
  /** ISO 8601 */
  startedAt: string;
  /** ISO 8601: when the picker comes back. */
  endsAt: string;
  /** ISO 8601: work stop time of the leave schedule. */
  stopAt: string | null;
}

/** Data for the leave warning / block windows. */
export interface LeaveInfo {
  schedule: LeaveScheduleStatus | null;
  /** Task of the running session (warning: to leave a note for next time). */
  task: Task | null;
  /** Work done since the start of the work day (block). */
  today: DaySummary;
}

export interface StartSessionRequest {
  taskId: string;
  /** Sets the leave schedule when none is active yet; omitted means working without one. */
  leave?: LeaveScheduleInput;
}

export interface DesktopApi {
  /** UI locale decided by the main process. */
  locale: Locale;
  picker: {
    getState(): Promise<PickerState>;
    startSession(req: StartSessionRequest): Promise<void>;
    snooze(): Promise<void>;
    cancelLeaveSchedule(): Promise<void>;
    /** Fired when the already-open picker is shown again. Returns an unsubscribe function. */
    onRefresh(listener: () => void): () => void;
  };
  tasks: {
    listAll(): Promise<Task[]>;
    add(input: TaskInput): Promise<Task>;
    /** Changes only the given fields. */
    update(id: string, patch: Partial<TaskInput>): Promise<Task>;
    /**
     * A row dropped after a drag (TaskService.move). `keepPosition` false changes only the priority. Resolves to
     * whether anything was written.
     */
    move(drop: TaskDrop, keepPosition: boolean): Promise<boolean>;
    complete(id: string): Promise<void>;
    reopen(id: string): Promise<void>;
    remove(id: string): Promise<void>;
    /** Subscribe to task changes. Returns an unsubscribe function. */
    onChanged(listener: () => void): () => void;
  };
  auth: {
    /** Open the system browser for Google sign-in. Resolves when signed in. */
    signIn(): Promise<void>;
  };
  storage: {
    /** Welcome page: keep the data on this PC only. Saves the choice and restarts the app. */
    useLocal(): Promise<void>;
  };
  shell: {
    /** Open a page of the user guide (docs/user-guide/<locale>/<page>.md) in the browser. */
    openGuide(page: GuidePage): Promise<void>;
  };
  /** End-to-end encryption (cloud mode). The data key never leaves the main process. */
  encryption: {
    /** First cloud sign-in: create and store the keys, resolve to the recovery key ("XXXX-XXXX-…") to show once. */
    create(passphrase: string): Promise<string>;
    /** After "I've saved my recovery key": close the setup and start syncing. */
    finishSetup(): Promise<void>;
    /** Another PC: false when the secret is wrong; on success the window closes and syncing starts. */
    unlock(kind: SecretKind, secret: string): Promise<boolean>;
    /** False when the current passphrase or the recovery key is wrong. */
    changePassphrase(kind: SecretKind, secret: string, newPassphrase: string): Promise<boolean>;
    /** The old recovery key stops working. */
    createRecoveryKey(): Promise<string>;
    copyRecoveryKey(recoveryKey: string): Promise<void>;
    /** Native save dialog; resolves without saving when canceled. */
    saveRecoveryKeyToFile(recoveryKey: string): Promise<void>;
    /** Leave the setup or unlock: sign out and go back to the welcome page. */
    signOut(): Promise<void>;
  };
  sync: {
    get(): Promise<SyncInfo>;
  };
  nav: {
    openPicker(): Promise<void>;
    openManagement(): Promise<void>;
    exit(): Promise<void>;
  };
  overlay: {
    getState(): Promise<RunningInfo | null>;
    /** Fired when the overlay is shown for a new session. Returns an unsubscribe function. */
    onRefresh(listener: () => void): () => void;
    complete(): Promise<void>;
    setExpanded(expanded: boolean): Promise<void>;
    /** Vertical drag along the right edge; the main process follows the cursor. */
    dragStart(): Promise<void>;
    dragMove(): Promise<void>;
    /** Drop: the main process saves the position for the next launch. */
    dragEnd(): Promise<void>;
  };
  leave: {
    getState(): Promise<LeaveInfo>;
    dismissWarning(): Promise<void>;
  };
  dialog: {
    confirm(title: string, message: string): Promise<boolean>;
    alert(title: string, message: string): Promise<void>;
  };
}

export const IPC = {
  /** Synchronous (sendSync): the preload reads the locale before the page renders. */
  appLocale: "app:locale",
  pickerGetState: "picker:getState",
  pickerStartSession: "picker:startSession",
  pickerSnooze: "picker:snooze",
  pickerCancelLeave: "picker:cancelLeave",
  pickerRefresh: "picker:refresh",
  tasksListAll: "tasks:listAll",
  tasksAdd: "tasks:add",
  tasksUpdate: "tasks:update",
  tasksMove: "tasks:move",
  tasksComplete: "tasks:complete",
  tasksReopen: "tasks:reopen",
  tasksRemove: "tasks:remove",
  tasksChanged: "tasks:changed",
  navOpenPicker: "nav:openPicker",
  navOpenManagement: "nav:openManagement",
  navExit: "nav:exit",
  overlayGetState: "overlay:getState",
  overlayRefresh: "overlay:refresh",
  overlayComplete: "overlay:complete",
  overlaySetExpanded: "overlay:setExpanded",
  overlayDragStart: "overlay:dragStart",
  overlayDragMove: "overlay:dragMove",
  overlayDragEnd: "overlay:dragEnd",
  leaveGetState: "leave:getState",
  leaveDismissWarning: "leave:dismissWarning",
  dialogConfirm: "dialog:confirm",
  dialogAlert: "dialog:alert",
  authSignIn: "auth:signIn",
  storageUseLocal: "storage:useLocal",
  shellOpenGuide: "shell:openGuide",
  encryptionCreate: "encryption:create",
  encryptionFinishSetup: "encryption:finishSetup",
  encryptionUnlock: "encryption:unlock",
  encryptionChangePassphrase: "encryption:changePassphrase",
  encryptionCreateRecoveryKey: "encryption:createRecoveryKey",
  encryptionCopyRecoveryKey: "encryption:copyRecoveryKey",
  encryptionSaveRecoveryKey: "encryption:saveRecoveryKey",
  encryptionSignOut: "encryption:signOut",
  syncGet: "sync:get",
} as const;
