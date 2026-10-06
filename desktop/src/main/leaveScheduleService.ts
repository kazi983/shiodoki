import {
  buildLeaveSchedule,
  type LeaveSchedule,
  type LeaveScheduleInput,
  type LeaveScheduleStatus,
} from "@shared/leave";
import type { TimerService } from "./timerService";

export interface LeaveCallbacks {
  onWarning(): void;
  onStop(): void;
}

/** Schedules the "5 minutes left" warning and the hard stop. */
export class LeaveScheduleService {
  private schedule: LeaveSchedule | null = null;
  private warningTimer: string | null = null;
  private stopTimer: string | null = null;

  constructor(
    private readonly timer: TimerService,
    private readonly callbacks: LeaveCallbacks,
  ) {}

  get isScheduled(): boolean {
    return this.schedule !== null;
  }

  scheduleLeave(input: LeaveScheduleInput, now: Date = new Date()): LeaveSchedule {
    const schedule = buildLeaveSchedule(input, now);
    this.cancel();
    this.schedule = schedule;
    this.warningTimer = this.timer.start(schedule.warnAt.getTime() - now.getTime(), () => {
      this.warningTimer = null;
      this.callbacks.onWarning();
    });
    this.stopTimer = this.timer.start(schedule.stopAt.getTime() - now.getTime(), () => {
      this.stopTimer = null;
      this.callbacks.onStop();
    });
    return schedule;
  }

  cancel(): void {
    this.timer.cancel(this.warningTimer);
    this.timer.cancel(this.stopTimer);
    this.warningTimer = null;
    this.stopTimer = null;
    this.schedule = null;
  }

  status(): LeaveScheduleStatus | null {
    if (!this.schedule) return null;
    return {
      leaveAt: this.schedule.leaveAt.toISOString(),
      stopAt: this.schedule.stopAt.toISOString(),
      bufferMinutes: this.schedule.bufferMinutes,
    };
  }
}
