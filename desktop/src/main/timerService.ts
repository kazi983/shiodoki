/**
 * Cancellable timers. This is the only place the main process should
 * schedule delayed work, so that everything can be cancelled on exit.
 */
export class TimerService {
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private counter = 0;

  start(delayMs: number, callback: () => void): string {
    const id = `t_${++this.counter}`;
    const handle = setTimeout(() => {
      this.timers.delete(id);
      callback();
    }, Math.max(0, delayMs));
    this.timers.set(id, handle);
    return id;
  }

  cancel(id: string | null | undefined): void {
    if (!id) return;
    const handle = this.timers.get(id);
    if (handle !== undefined) {
      clearTimeout(handle);
      this.timers.delete(id);
    }
  }

  cancelAll(): void {
    for (const handle of this.timers.values()) clearTimeout(handle);
    this.timers.clear();
  }

  get activeCount(): number {
    return this.timers.size;
  }
}
