export interface ScreenStateCallbacks {
  onOff(): void;
  onOn(): void;
}

/**
 * Folds lock and suspend into one "screen off" state. The screen is off while
 * it is locked (GNOME also reports the idle blank this way) or the system is
 * suspended, and back on once neither holds, so resuming to the lock screen
 * waits for the unlock.
 */
export class ScreenState {
  private locked = false;
  private suspended = false;

  constructor(private readonly callbacks: ScreenStateCallbacks) {}

  setLocked(locked: boolean): void {
    this.update(() => (this.locked = locked));
  }

  setSuspended(suspended: boolean): void {
    this.update(() => (this.suspended = suspended));
  }

  private get isOff(): boolean {
    return this.locked || this.suspended;
  }

  private update(change: () => void): void {
    const wasOff = this.isOff;
    change();
    if (this.isOff && !wasOff) this.callbacks.onOff();
    else if (!this.isOff && wasOff) this.callbacks.onOn();
  }
}

/**
 * Reads a line of `gdbus monitor` on org.gnome.ScreenSaver, e.g.
 * "/org/gnome/ScreenSaver: org.gnome.ScreenSaver.ActiveChanged (true,)".
 * Returns null for any other line.
 */
export function parseScreenSaverLine(line: string): boolean | null {
  const match = /org\.gnome\.ScreenSaver\.ActiveChanged \((true|false),\)/.exec(line);
  return match ? match[1] === "true" : null;
}
