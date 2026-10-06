import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi, type Mock } from "vitest";
import { AppController, type WindowPort } from "../src/main/appController";
import { SessionService } from "../src/main/sessionService";
import { JsonFileTaskRepository } from "../src/main/taskRepository";
import { TaskService } from "../src/main/taskService";
import { TimerService } from "../src/main/timerService";

const MIN = 60_000;
const INTERVAL = 30 * MIN;
const SNOOZE = 5 * MIN;

class FakeWindows implements WindowPort {
  calls: string[] = [];
  picker = false;
  overlay = false;
  leave: "warning" | "block" | null = null;
  management = false;

  showPicker() {
    this.calls.push("showPicker");
    this.picker = true;
  }
  closePicker() {
    this.picker = false;
  }
  showManagement() {
    this.management = true;
  }
  closeManagement() {
    this.management = false;
  }
  showOverlay() {
    this.overlay = true;
  }
  hideOverlay() {
    this.overlay = false;
  }
  showLeave(mode: "warning" | "block") {
    this.leave = mode;
  }
  closeLeave() {
    this.leave = null;
  }
}

let dir: string;
let file: string;
let windows: FakeWindows;
let lifecycle: { quit: Mock<() => void>; relaunch: Mock<() => void> };
let tasks: TaskService;
let controller: AppController;

function storedSessions(): Array<{ elapsedMinutes: number; endReason: string }> {
  return JSON.parse(readFileSync(file, "utf8")).sessions;
}

beforeEach(async () => {
  vi.useFakeTimers();
  // 2026-10-06 20:00 local time
  vi.setSystemTime(new Date(2026, 9, 6, 20, 0));
  dir = mkdtempSync(join(tmpdir(), "controller-test-"));
  file = join(dir, "store.json");
  windows = new FakeWindows();
  lifecycle = { quit: vi.fn<() => void>(), relaunch: vi.fn<() => void>() };
  tasks = new TaskService(new JsonFileTaskRepository(file));
  controller = new AppController(tasks, new SessionService("pc"), new TimerService(), windows, lifecycle, {
    intervalMs: INTERVAL,
    snoozeMs: SNOOZE,
    testMode: false,
  });
  controller.start();
});

afterEach(() => {
  vi.useRealTimers();
  rmSync(dir, { recursive: true, force: true });
});

async function addTask(name = "Write code") {
  return tasks.add({ name, priority: "NOW", memo: "" });
}

const LEAVE = { leaveTime: "23:30", bufferMinutes: 15 }; // stop 23:15, warning 23:10

describe("session flow", () => {
  test("start -> 30 minutes -> session recorded and picker shown again", async () => {
    expect(windows.picker).toBe(true);
    const t = await addTask();

    await controller.startSession({ taskId: t.id, leave: LEAVE });
    expect(windows.picker).toBe(false);
    expect(windows.overlay).toBe(true);
    expect(controller.currentStatus).toBe("running");
    expect((await tasks.getPreferences()).lastSelectedTaskId).toBe(t.id);

    await vi.advanceTimersByTimeAsync(INTERVAL);
    expect(windows.picker).toBe(true);
    expect(windows.overlay).toBe(false);
    expect(controller.currentStatus).toBe("idle");
    expect(storedSessions()).toMatchObject([{ elapsedMinutes: 30, endReason: "interval" }]);
    expect((await tasks.get(t.id)).totalMinutes).toBe(30);
  });

  test("the first session requires a leave time", async () => {
    const t = await addTask();
    await expect(controller.startSession({ taskId: t.id })).rejects.toThrow("退勤時刻");
    await controller.startSession({ taskId: t.id, leave: LEAVE });
    await controller.completeFromOverlay();
    // Already scheduled: no leave input needed any more
    await controller.startSession({ taskId: t.id });
    expect(controller.currentStatus).toBe("running");
  });

  test("completing early cancels the 30-minute timer (v1 bug)", async () => {
    const t = await addTask();
    await controller.startSession({ taskId: t.id, leave: LEAVE });
    await vi.advanceTimersByTimeAsync(10 * MIN);
    await controller.completeFromOverlay();
    expect(windows.picker).toBe(true);

    const other = await addTask("Other");
    await controller.startSession({ taskId: other.id });
    windows.calls = [];

    // The first session's 30-minute mark must not reopen the picker.
    await vi.advanceTimersByTimeAsync(25 * MIN);
    expect(windows.calls).toEqual([]);
    expect(windows.overlay).toBe(true);

    await vi.advanceTimersByTimeAsync(5 * MIN);
    expect(windows.calls).toEqual(["showPicker"]);
    expect(storedSessions().map((s) => [s.elapsedMinutes, s.endReason])).toEqual([
      [10, "completed"],
      [30, "interval"],
    ]);
  });

  test("snooze reopens the picker after 5 minutes", async () => {
    controller.snooze();
    expect(windows.picker).toBe(false);
    expect(controller.currentStatus).toBe("snoozed");
    await vi.advanceTimersByTimeAsync(SNOOZE - 1);
    expect(windows.picker).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(windows.picker).toBe(true);
    expect(controller.currentStatus).toBe("idle");
  });

  test("opening the picker from the tray completes the running session", async () => {
    const t = await addTask();
    await controller.startSession({ taskId: t.id, leave: LEAVE });
    await vi.advanceTimersByTimeAsync(12 * MIN);
    await controller.openPicker();
    expect(windows.picker).toBe(true);
    expect(windows.overlay).toBe(false);
    expect(storedSessions()).toMatchObject([{ elapsedMinutes: 12, endReason: "completed" }]);
  });

  test("completed tasks cannot be started", async () => {
    const t = await addTask();
    await tasks.complete(t.id);
    await expect(controller.startSession({ taskId: t.id, leave: LEAVE })).rejects.toThrow();
  });
});

describe("leave schedule", () => {
  test("warning, then stop blocks the app and records the session", async () => {
    const t = await addTask();
    vi.setSystemTime(new Date(2026, 9, 6, 22, 50));
    await controller.startSession({ taskId: t.id, leave: LEAVE });

    // 23:10 warning
    await vi.advanceTimersByTimeAsync(20 * MIN);
    expect(windows.leave).toBe("warning");
    controller.dismissWarning();
    expect(windows.leave).toBeNull();

    // 23:15 stop
    await vi.advanceTimersByTimeAsync(5 * MIN);
    expect(windows.leave).toBe("block");
    expect(windows.overlay).toBe(false);
    expect(controller.currentStatus).toBe("leave_blocked");
    expect(storedSessions()).toMatchObject([{ elapsedMinutes: 25, endReason: "leave_stop" }]);

    // Nothing reopens and no new session can start
    await controller.openPicker();
    controller.openManagement();
    expect(windows.picker).toBe(false);
    expect(windows.management).toBe(false);
    await expect(controller.startSession({ taskId: t.id })).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(60 * MIN);
    expect(windows.picker).toBe(false);
  });

  test("after the warning the 30-minute mark does not reopen the picker", async () => {
    const t = await addTask();
    vi.setSystemTime(new Date(2026, 9, 6, 22, 45));
    await controller.startSession({ taskId: t.id, leave: { leaveTime: "23:40", bufferMinutes: 10 } });
    // stop 23:30, warning 23:25; the first 30-minute mark (23:15) comes before both
    await vi.advanceTimersByTimeAsync(30 * MIN);
    expect(windows.picker).toBe(true);
    await controller.startSession({ taskId: t.id });
    // 23:25 warning
    await vi.advanceTimersByTimeAsync(10 * MIN);
    expect(windows.leave).toBe("warning");
    controller.dismissWarning();
    windows.calls = [];
    // 23:30 stop happens before the next 30-minute mark
    await vi.advanceTimersByTimeAsync(5 * MIN);
    expect(windows.leave).toBe("block");
    expect(windows.calls).toEqual([]);
  });

  test("changing the leave time cancels the schedule", async () => {
    const t = await addTask();
    vi.setSystemTime(new Date(2026, 9, 6, 22, 50));
    await controller.startSession({ taskId: t.id, leave: LEAVE });
    controller.cancelLeaveSchedule();
    expect((await controller.getPickerState()).leave).toBeNull();
    await vi.advanceTimersByTimeAsync(60 * MIN);
    expect(windows.leave).toBeNull();
  });
});

describe("lifecycle", () => {
  test("exit records the running session exactly once", async () => {
    const t = await addTask();
    await controller.startSession({ taskId: t.id, leave: LEAVE });
    await vi.advanceTimersByTimeAsync(7 * MIN);

    await controller.exit();
    await controller.exit(); // e.g. tray exit followed by before-quit
    expect(storedSessions()).toMatchObject([{ elapsedMinutes: 7, endReason: "app_exit" }]);
    expect(lifecycle.quit).toHaveBeenCalledTimes(2);
    expect(controller.currentStatus).toBe("stopped");
    expect((await tasks.get(t.id)).totalMinutes).toBe(7);
  });

  test("restart records the session and relaunches", async () => {
    const t = await addTask();
    await controller.startSession({ taskId: t.id, leave: LEAVE });
    await vi.advanceTimersByTimeAsync(3 * MIN);
    await controller.restart();
    expect(storedSessions()).toMatchObject([{ elapsedMinutes: 3, endReason: "app_exit" }]);
    expect(lifecycle.relaunch).toHaveBeenCalledOnce();
  });

  test("management back button returns to the picker", () => {
    controller.openManagement();
    expect(windows.picker).toBe(false);
    expect(windows.management).toBe(true);
    controller.backToPicker();
    expect(windows.management).toBe(false);
    expect(windows.picker).toBe(true);
  });
});
