import type { DesktopStateData } from "@shared/sync";
import type { StatusSnapshot } from "./appController";

export const HEARTBEAT_MS = 5 * 60_000;

/**
 * Writes the PC's current status to users/{uid}/state/desktop so the
 * Android app can show it (requirements D-02 / M-05). While the app runs,
 * the same state is re-sent every 5 minutes as a heartbeat; Android treats
 * an old heartbeatAt as "PC offline".
 */
export class DesktopStateReporter {
  private last: DesktopStateData | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly write: (state: DesktopStateData) => Promise<void>,
    private readonly device: string,
    private readonly heartbeatMs = HEARTBEAT_MS,
  ) {}

  report(snapshot: StatusSnapshot): void {
    const state: DesktopStateData = {
      status: snapshot.status,
      currentTaskId: snapshot.currentTaskId,
      currentTaskName: snapshot.currentTaskName,
      startedAt: snapshot.startedAt?.toISOString() ?? null,
      nextPromptAt: snapshot.nextPromptAt?.toISOString() ?? null,
      device: this.device,
    };
    if (this.last && JSON.stringify(this.last) === JSON.stringify(state)) return;
    this.last = state;
    this.send(state);

    if (state.status === "stopped") this.stop();
    else if (!this.heartbeat) {
      this.heartbeat = setInterval(() => this.last && this.send(this.last), this.heartbeatMs);
    }
  }

  stop(): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
  }

  private send(state: DesktopStateData): void {
    this.write(state).catch((error) => console.error("Failed to write desktop state:", error));
  }
}
