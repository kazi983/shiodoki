import type { PickerState, StartSessionRequest } from "@shared/ipc";
import type { DesktopStatus } from "@shared/desktopState";
import type { EndReason } from "@shared/session";
import type { SyncInfo } from "@shared/sync";
import { LeaveScheduleService } from "./leaveScheduleService";
import { SessionService } from "./sessionService";
import { TaskService } from "./taskService";
import { TimerService } from "./timerService";

/** Window operations the controller needs. Implemented with Electron in windowManager.ts. */
export interface WindowPort {
  showPicker(): void;
  closePicker(): void;
  showManagement(): void;
  closeManagement(): void;
  showOverlay(): void;
  hideOverlay(): void;
  showLeave(mode: "warning" | "block"): void;
  closeLeave(): void;
}

export interface LifecyclePort {
  quit(): void;
  relaunch(): void;
}


/** none -> warned (5 minutes left) -> blocked (stop time reached) */
type LeavePhase = "none" | "warned" | "blocked";

export type { DesktopStatus };

/** What the PC is doing, written to users/{uid}/state/desktop (requirements D-02). */
export interface StatusSnapshot {
  status: DesktopStatus;
  currentTaskId: string | null;
  currentTaskName: string | null;
  startedAt: Date | null;
  /** When the picker will be shown next (end of the 30-minute session or snooze). */
  nextPromptAt: Date | null;
}

export interface AppControllerOptions {
  intervalMs: number;
  snoozeMs: number;
  testMode: boolean;
  now?: () => Date;
  onStatusChange?: (snapshot: StatusSnapshot) => void;
  /** Runs after the last session is recorded and before quitting (e.g. flush to the server). */
  beforeQuit?: () => Promise<void>;
  syncInfo?: () => SyncInfo;
}

/**
 * Top-level orchestrator of the session flow:
 *
 *   picker --start--> running (overlay) --30 min / overlay click--> picker
 *   picker --snooze (Esc / close)--> snoozed --5 min--> picker
 *   any --leave warning--> warning window; --leave stop--> block window
 *
 * Every path that ends a session goes through finishSession(), which
 * records the session exactly once.
 */
export class AppController {
  private status: DesktopStatus = "idle";
  private leavePhase: LeavePhase = "none";
  private intervalTimer: string | null = null;
  private snoozeTimer: string | null = null;
  private shuttingDown = false;
  private nextPromptAt: Date | null = null;
  private readonly leave: LeaveScheduleService;
  private readonly now: () => Date;

  constructor(
    private readonly tasks: TaskService,
    private readonly sessions: SessionService,
    private readonly timer: TimerService,
    private readonly windows: WindowPort,
    private readonly lifecycle: LifecyclePort,
    private readonly options: AppControllerOptions,
  ) {
    this.now = options.now ?? (() => new Date());
    this.leave = new LeaveScheduleService(timer, {
      onWarning: () => this.onLeaveWarning(),
      onStop: () => void this.onLeaveStop(),
    });
  }

  get currentStatus(): DesktopStatus {
    return this.status;
  }

  start(): void {
    this.showPicker();
  }

  // -------------------------
  // picker
  // -------------------------

  async getPickerState(): Promise<PickerState> {
    const [tasks, prefs] = await Promise.all([this.tasks.listIncomplete(), this.tasks.getPreferences()]);
    return {
      tasks,
      lastSelectedTaskId: prefs.lastSelectedTaskId,
      leave: this.leave.status(),
      testMode: this.options.testMode,
      sync: this.syncInfo(),
    };
  }

  /**
   * Open the picker on user request (tray / back button). A running
   * session is completed first so its time is not lost.
   */
  async openPicker(): Promise<void> {
    if (this.leavePhase === "blocked") return;
    if (this.sessions.current) {
      this.timer.cancel(this.intervalTimer);
      this.intervalTimer = null;
      await this.finishSession("completed");
    }
    this.showPicker();
  }

  async startSession(req: StartSessionRequest): Promise<void> {
    if (this.leavePhase === "blocked") throw new Error("作業終了時刻を過ぎています");
    const task = await this.tasks.get(req.taskId);
    if (task.completed) throw new Error("完了済みのタスクは開始できません");

    if (!this.leave.isScheduled) {
      if (!req.leave) throw new Error("退勤時刻を入力してください");
      this.leave.scheduleLeave(req.leave, this.now());
      this.leavePhase = "none";
    }

    // A session may still be running if the picker was opened from the tray.
    if (this.sessions.current) await this.finishSession("completed");

    await this.tasks.markLastSelected(task.id);
    this.cancelSnooze();
    this.timer.cancel(this.intervalTimer);

    this.windows.closePicker();
    this.sessions.start(task, this.now());
    this.windows.showOverlay();
    this.nextPromptAt = new Date(this.now().getTime() + this.options.intervalMs);
    this.setStatus("running");

    this.intervalTimer = this.timer.start(this.options.intervalMs, () => {
      this.intervalTimer = null;
      void this.onIntervalElapsed();
    });
  }

  snooze(): void {
    if (this.status !== "idle") return;
    this.windows.closePicker();
    this.cancelSnooze();
    this.nextPromptAt = new Date(this.now().getTime() + this.options.snoozeMs);
    this.setStatus("snoozed");
    this.snoozeTimer = this.timer.start(this.options.snoozeMs, () => {
      this.snoozeTimer = null;
      if (this.leavePhase === "blocked") return;
      this.showPicker();
    });
  }

  cancelLeaveSchedule(): void {
    if (this.leavePhase === "blocked") return;
    this.leave.cancel();
    this.leavePhase = "none";
  }

  // -------------------------
  // session end
  // -------------------------

  /** Overlay click: finish the current session and pick the next task. */
  async completeFromOverlay(): Promise<void> {
    this.timer.cancel(this.intervalTimer);
    this.intervalTimer = null;
    await this.finishSession("completed");
    if (this.leavePhase === "blocked") return;
    this.showPicker();
  }

  private async onIntervalElapsed(): Promise<void> {
    await this.finishSession("interval");
    // After the leave warning, do not start nagging for a new session.
    if (this.leavePhase !== "none") {
      this.setStatus("idle");
      return;
    }
    this.showPicker();
  }

  private async finishSession(reason: EndReason): Promise<void> {
    this.windows.hideOverlay();
    const record = this.sessions.finish(reason, this.now());
    if (this.status === "running") {
      this.nextPromptAt = null;
      this.setStatus("idle");
    }
    await this.tasks.recordSession(record);
  }

  // -------------------------
  // leave schedule
  // -------------------------

  private onLeaveWarning(): void {
    if (this.leavePhase !== "none") return;
    this.leavePhase = "warned";
    this.windows.closePicker();
    this.windows.showLeave("warning");
  }

  dismissWarning(): void {
    if (this.leavePhase === "warned") this.windows.closeLeave();
  }

  private async onLeaveStop(): Promise<void> {
    this.leavePhase = "blocked";
    this.timer.cancel(this.intervalTimer);
    this.intervalTimer = null;
    this.cancelSnooze();
    await this.finishSession("leave_stop");
    this.nextPromptAt = null;
    this.setStatus("leave_blocked");
    this.windows.closePicker();
    this.windows.closeManagement();
    this.windows.closeLeave();
    this.windows.showLeave("block");
  }

  // -------------------------
  // navigation
  // -------------------------

  openManagement(): void {
    if (this.leavePhase === "blocked") return;
    this.windows.closePicker();
    this.windows.showManagement();
  }

  /** Back button / close on the management window. */
  backToPicker(): void {
    this.windows.closeManagement();
    if (this.leavePhase === "blocked") return;
    if (this.sessions.current) return; // keep the running session; the overlay is still there
    this.showPicker();
  }

  // -------------------------
  // lifecycle
  // -------------------------

  async exit(): Promise<void> {
    await this.shutdown();
    this.lifecycle.quit();
  }

  /** `beforeRelaunch` runs after the session is recorded (e.g. sign out). */
  async restart(beforeRelaunch?: () => Promise<void>): Promise<void> {
    await this.shutdown();
    await beforeRelaunch?.();
    this.lifecycle.relaunch();
  }

  private async shutdown(): Promise<void> {
    if (this.shuttingDown) return;
    this.shuttingDown = true;
    this.timer.cancelAll();
    await this.finishSession("app_exit");
    this.nextPromptAt = null;
    this.setStatus("stopped");
    try {
      await this.options.beforeQuit?.();
    } catch (error) {
      console.error("beforeQuit failed:", error);
    }
  }

  get isShuttingDown(): boolean {
    return this.shuttingDown;
  }

  private showPicker(): void {
    this.cancelSnooze();
    if (!this.sessions.current) this.nextPromptAt = null;
    this.setStatus(this.sessions.current ? "running" : "idle");
    this.windows.closeManagement();
    this.windows.showPicker();
  }

  syncInfo(): SyncInfo {
    return this.options.syncInfo?.() ?? { status: "local", email: null };
  }

  private setStatus(status: DesktopStatus): void {
    this.status = status;
    const current = this.sessions.current;
    this.options.onStatusChange?.({
      status,
      currentTaskId: status === "running" ? (current?.taskId ?? null) : null,
      currentTaskName: status === "running" ? (current?.taskName ?? null) : null,
      startedAt: status === "running" ? (current?.startedAt ?? null) : null,
      nextPromptAt: this.nextPromptAt,
    });
  }

  private cancelSnooze(): void {
    this.timer.cancel(this.snoozeTimer);
    this.snoozeTimer = null;
  }
}
