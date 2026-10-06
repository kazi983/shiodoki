/**
 * Contract between the renderer (window.api) and the main process.
 */

import type { LeaveScheduleInput, LeaveScheduleStatus } from "./leave";
import type { SyncInfo } from "./sync";
import type { Task, TaskInput } from "./task";

export interface PickerState {
  tasks: Task[];
  lastSelectedTaskId: string | null;
  leave: LeaveScheduleStatus | null;
  testMode: boolean;
  sync: SyncInfo;
}

export interface StartSessionRequest {
  taskId: string;
  /** Required when no leave schedule is active yet. */
  leave?: LeaveScheduleInput;
}

export interface DesktopApi {
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
    update(id: string, input: TaskInput): Promise<Task>;
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
  sync: {
    get(): Promise<SyncInfo>;
  };
  nav: {
    openPicker(): Promise<void>;
    openManagement(): Promise<void>;
    exit(): Promise<void>;
  };
  overlay: {
    complete(): Promise<void>;
    setExpanded(expanded: boolean): Promise<void>;
  };
  leave: {
    dismissWarning(): Promise<void>;
  };
  dialog: {
    confirm(title: string, message: string): Promise<boolean>;
    alert(title: string, message: string): Promise<void>;
  };
}

export const IPC = {
  pickerGetState: "picker:getState",
  pickerStartSession: "picker:startSession",
  pickerSnooze: "picker:snooze",
  pickerCancelLeave: "picker:cancelLeave",
  pickerRefresh: "picker:refresh",
  tasksListAll: "tasks:listAll",
  tasksAdd: "tasks:add",
  tasksUpdate: "tasks:update",
  tasksComplete: "tasks:complete",
  tasksReopen: "tasks:reopen",
  tasksRemove: "tasks:remove",
  tasksChanged: "tasks:changed",
  navOpenPicker: "nav:openPicker",
  navOpenManagement: "nav:openManagement",
  navExit: "nav:exit",
  overlayComplete: "overlay:complete",
  overlaySetExpanded: "overlay:setExpanded",
  leaveDismissWarning: "leave:dismissWarning",
  dialogConfirm: "dialog:confirm",
  dialogAlert: "dialog:alert",
  authSignIn: "auth:signIn",
  syncGet: "sync:get",
} as const;
